/**
 * Proposal delivery — Send Proposal action.
 * Proposal becomes Sent only after Resend accepts the message.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { createProposalPublicLink, PublicLinkError } from '../public-links/mutations';
import { recordStudioActivity } from '../studio/activity';
import { canTransitionProject, transitionSideEffects } from '../projects/workflow';
import { formatMoney } from '../clients/format';
import type { CurrencyCode } from '../supabase/domain';
import {
  getPublicSiteOrigin,
  getStudioDeliveryBcc,
  readStudioEmailEnvFromRuntime,
  type StudioEmailEnvSource,
} from './config';
import { sendStudioEmail } from './send';
import { insertQueuedEmailLog, markEmailLogFailed, markEmailLogSent } from './logging';
import { renderProposalDeliveryEmail } from './templates';
import { formatDateOnly } from '../clients/format';
import { resolveDeliveryRecipient } from './resolve-recipient';
import {
  isMicrosoftConsumerMailbox,
  transactionalDeliveryHeaders,
} from './deliverability';

export class ProposalSendError extends Error {
  readonly code: 'not_found' | 'invalid' | 'conflict' | 'provider' | 'failed';

  constructor(code: ProposalSendError['code'], message: string) {
    super(message);
    this.name = 'ProposalSendError';
    this.code = code;
  }
}

export type ProposalSendResult = {
  alreadySent: boolean;
  emailLogId: string;
  recipientEmail: string;
  providerMessageId?: string | null;
};

/**
 * Idempotency: proposal:{versionId}:delivery
 * First successful provider acceptance wins for that key.
 * If the first-delivery key already succeeded, Send delegates to Resend so the
 * client still receives a fresh email (expired/declined "Send" must not no-op).
 */
export async function sendProposalEmail(
  supabase: StudioSupabaseClient,
  input: {
    proposalId: string;
    actorProfileId: string;
    recipientEmail?: string | null;
    emailEnv?: StudioEmailEnvSource;
  },
): Promise<ProposalSendResult> {
  const emailEnv = input.emailEnv ?? (await readStudioEmailEnvFromRuntime());
  const siteOrigin = getPublicSiteOrigin(emailEnv);

  const { data: proposal, error } = await supabase
    .from('proposals')
    .select(
      'id, status, title, proposal_number, expires_at, sent_at, accepted_at, client_id, project_id, current_version_id',
    )
    .eq('id', input.proposalId)
    .maybeSingle();
  if (error || !proposal) {
    throw new ProposalSendError('not_found', 'Proposal not found.');
  }
  if (proposal.status === 'archived') {
    throw new ProposalSendError('invalid', 'Archived proposals cannot be sent.');
  }
  if (proposal.status === 'accepted' || proposal.accepted_at) {
    throw new ProposalSendError('invalid', 'Accepted proposals cannot be sent again.');
  }
  if (!proposal.current_version_id) {
    throw new ProposalSendError('invalid', 'Finalize a proposal version before sending.');
  }

  const { data: version, error: versionError } = await supabase
    .from('proposal_versions')
    .select(
      'id, version_number, title, is_immutable, total_minor, currency, client_contact_name, client_contact_email, project_name, finalized_at',
    )
    .eq('id', proposal.current_version_id)
    .eq('proposal_id', proposal.id)
    .maybeSingle();
  if (versionError || !version || !version.is_immutable) {
    throw new ProposalSendError('invalid', 'Finalize the proposal version before sending.');
  }

  const recipient = await resolveDeliveryRecipient(supabase, {
    recipientEmail: input.recipientEmail,
    snapshotEmail: version.client_contact_email,
    clientId: proposal.client_id,
  });
  if (!recipient) {
    throw new ProposalSendError('invalid', 'A valid recipient email is required.');
  }

  const idempotencyKey = `proposal:${version.id}:delivery`;

  // If already successfully sent for this version, do not claim success without
  // sending — delegate to explicit resend with a fresh idempotency key + link.
  const log = await insertQueuedEmailLog(supabase, {
    emailType: 'proposal_sent',
    recipientEmail: recipient,
    subject: `Proposal from Che Xu Studio — ${version.project_name || proposal.title}`,
    idempotencyKey,
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    proposalId: proposal.id,
    metadata: {
      proposal_version_id: version.id,
      version_number: version.version_number,
    },
  });

  if (!log.created && (log.status === 'sent' || log.status === 'delivered')) {
    const resent = await resendProposalEmail(supabase, {
      ...input,
      recipientEmail: recipient,
      emailEnv,
    });
    return {
      alreadySent: false,
      emailLogId: resent.emailLogId,
      recipientEmail: resent.recipientEmail,
      providerMessageId: resent.providerMessageId,
    };
  }

  let rawUrl: string;
  try {
    const link = await createProposalPublicLink(supabase, {
      proposalId: proposal.id,
      proposalVersionId: version.id,
      actorProfileId: input.actorProfileId,
      siteOrigin,
      mode: 'mint',
    });
    rawUrl = link.rawUrl;
  } catch (err) {
    if (err instanceof PublicLinkError) {
      throw new ProposalSendError('invalid', err.message);
    }
    throw err;
  }

  const totalLabel = formatMoney(
    version.total_minor,
    (version.currency as CurrencyCode) || 'CAD',
  );
  const rendered = renderProposalDeliveryEmail({
    contactName: version.client_contact_name || '',
    projectName: version.project_name || proposal.title,
    proposalNumber: proposal.proposal_number,
    proposalTitle: version.title || proposal.title,
    expiresAt: proposal.expires_at
      ? formatDateOnly(proposal.expires_at.slice(0, 10))
      : null,
    totalLabel,
    reviewUrl: rawUrl,
  });

  // Update subject on log if we reserved with a placeholder
  await supabase
    .from('email_logs')
    .update({ subject: rendered.subject, recipient_email: recipient })
    .eq('id', log.id);

  // PDF attachments raise Hotmail junk scores; keep link-only for Microsoft consumer mail.
  let pdfAttachment = null;
  if (!isMicrosoftConsumerMailbox(recipient)) {
    const { maybeProposalPdfAttachment } = await import('../pdf/attachments');
    const { proposalPdfFilename } = await import('../pdf/filenames');
    pdfAttachment = await maybeProposalPdfAttachment(supabase, {
      proposalId: proposal.id,
      versionId: version.id,
      filename: proposalPdfFilename(proposal.proposal_number, version.version_number),
    });
  }

  const sendResult = await sendStudioEmail(
    {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      disableTracking: true,
      bcc: getStudioDeliveryBcc(emailEnv),
      headers: transactionalDeliveryHeaders(`proposal:${proposal.id}:${version.id}`),
      tags: [
        { name: 'email_type', value: 'proposal_sent' },
        { name: 'proposal_id', value: proposal.id },
      ],
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
    },
    emailEnv,
  );

  if (!sendResult.ok) {
    await markEmailLogFailed(supabase, log.id, sendResult.error);
    await recordStudioActivity(supabase, {
      actorProfileId: input.actorProfileId,
      action: 'proposal.email_failed',
      clientId: proposal.client_id,
      projectId: proposal.project_id,
      subjectType: 'proposal',
      subjectId: proposal.id,
      metadata: { email_log_id: log.id, error: sendResult.error },
    });
    throw new ProposalSendError(
      'provider',
      `Unable to send proposal email (${sendResult.error}). Check Email history and provider (Graph/Resend).`,
    );
  }

  await markEmailLogSent(supabase, log.id, sendResult.providerMessageId);

  // Domain transition only after provider acceptance
  const now = new Date().toISOString();
  const { data: updatedProposal } = await supabase
    .from('proposals')
    .update({ status: 'sent', sent_at: now })
    .eq('id', proposal.id)
    .in('status', ['draft', 'viewed', 'changes_requested', 'sent', 'expired', 'declined'])
    .select('id, status')
    .maybeSingle();

  if (!updatedProposal && proposal.status !== 'sent') {
    // Concurrent update — check current
    const { data: again } = await supabase
      .from('proposals')
      .select('status')
      .eq('id', proposal.id)
      .maybeSingle();
    if (again?.status !== 'sent' && again?.status !== 'accepted') {
      // Email already sent — record anomaly but do not resend
      await recordStudioActivity(supabase, {
        actorProfileId: input.actorProfileId,
        action: 'proposal.email_failed',
        clientId: proposal.client_id,
        projectId: proposal.project_id,
        subjectType: 'proposal',
        subjectId: proposal.id,
        metadata: {
          note: 'provider_accepted_but_status_update_failed',
          email_log_id: log.id,
        },
      });
    }
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'proposal.sent',
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    subjectType: 'proposal',
    subjectId: proposal.id,
    metadata: {
      email_log_id: log.id,
      proposal_version_id: version.id,
      recipient_domain: recipient.split('@')[1] || null,
    },
  });

  // Project: proposal → awaiting_approval when allowed
  if (proposal.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('id, status')
      .eq('id', proposal.project_id)
      .maybeSingle();
    if (project && canTransitionProject(project.status as 'proposal', 'awaiting_approval')) {
      if (project.status === 'proposal') {
        const effects = transitionSideEffects('proposal', 'awaiting_approval');
        const { data: moved } = await supabase
          .from('projects')
          .update({
            status: 'awaiting_approval',
            ...(effects.completed_at !== undefined
              ? { completed_at: effects.completed_at }
              : {}),
          })
          .eq('id', project.id)
          .eq('status', 'proposal')
          .select('id')
          .maybeSingle();
        if (moved) {
          await recordStudioActivity(supabase, {
            actorProfileId: input.actorProfileId,
            action: 'project.status_changed',
            clientId: proposal.client_id,
            projectId: project.id,
            subjectType: 'project',
            subjectId: project.id,
            metadata: {
              from: 'proposal',
              to: 'awaiting_approval',
              reason: 'proposal_sent',
            },
          });
        }
      }
    }
  }

  return {
    alreadySent: false,
    emailLogId: log.id,
    recipientEmail: recipient,
    providerMessageId: sendResult.providerMessageId,
  };
}

/** Explicit resend — new idempotency key, mints a fresh link. */
export async function resendProposalEmail(
  supabase: StudioSupabaseClient,
  input: {
    proposalId: string;
    actorProfileId: string;
    recipientEmail?: string | null;
    emailEnv?: StudioEmailEnvSource;
  },
): Promise<{ emailLogId: string; recipientEmail: string; providerMessageId: string }> {
  const emailEnv = input.emailEnv ?? (await readStudioEmailEnvFromRuntime());
  const siteOrigin = getPublicSiteOrigin(emailEnv);

  const { data: proposal } = await supabase
    .from('proposals')
    .select(
      'id, status, title, proposal_number, expires_at, accepted_at, client_id, project_id, current_version_id',
    )
    .eq('id', input.proposalId)
    .maybeSingle();
  if (!proposal?.current_version_id) {
    throw new ProposalSendError('not_found', 'Proposal not found.');
  }
  if (proposal.status === 'archived' || proposal.status === 'accepted') {
    throw new ProposalSendError('invalid', 'This proposal cannot be resent.');
  }

  const { data: version } = await supabase
    .from('proposal_versions')
    .select(
      'id, version_number, title, is_immutable, total_minor, currency, client_contact_name, client_contact_email, project_name',
    )
    .eq('id', proposal.current_version_id)
    .maybeSingle();
  if (!version?.is_immutable) {
    throw new ProposalSendError('invalid', 'Finalize the proposal version before sending.');
  }

  const recipient = await resolveDeliveryRecipient(supabase, {
    recipientEmail: input.recipientEmail,
    snapshotEmail: version.client_contact_email,
    clientId: proposal.client_id,
  });
  if (!recipient) {
    throw new ProposalSendError('invalid', 'A valid recipient email is required.');
  }

  const idempotencyKey = `proposal:${version.id}:resend:${Date.now()}`;
  const link = await createProposalPublicLink(supabase, {
    proposalId: proposal.id,
    proposalVersionId: version.id,
    actorProfileId: input.actorProfileId,
    siteOrigin,
    mode: 'mint',
  });

  const rendered = renderProposalDeliveryEmail({
    contactName: version.client_contact_name || '',
    projectName: version.project_name || proposal.title,
    proposalNumber: proposal.proposal_number,
    proposalTitle: version.title || proposal.title,
    expiresAt: proposal.expires_at
      ? formatDateOnly(proposal.expires_at.slice(0, 10))
      : null,
    totalLabel: formatMoney(version.total_minor, (version.currency as CurrencyCode) || 'CAD'),
    reviewUrl: link.rawUrl,
  });

  const log = await insertQueuedEmailLog(supabase, {
    emailType: 'proposal_sent',
    recipientEmail: recipient,
    subject: rendered.subject,
    idempotencyKey,
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    proposalId: proposal.id,
    metadata: { resend: true, proposal_version_id: version.id },
  });

  let pdfAttachment = null;
  if (!isMicrosoftConsumerMailbox(recipient)) {
    const { maybeProposalPdfAttachment } = await import('../pdf/attachments');
    const { proposalPdfFilename } = await import('../pdf/filenames');
    pdfAttachment = await maybeProposalPdfAttachment(supabase, {
      proposalId: proposal.id,
      versionId: version.id,
      filename: proposalPdfFilename(proposal.proposal_number, version.version_number),
    });
  }

  const sendResult = await sendStudioEmail(
    {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      disableTracking: true,
      bcc: getStudioDeliveryBcc(emailEnv),
      headers: transactionalDeliveryHeaders(`proposal-resend:${proposal.id}:${version.id}`),
      tags: [
        { name: 'email_type', value: 'proposal_resent' },
        { name: 'proposal_id', value: proposal.id },
      ],
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
    },
    emailEnv,
  );

  if (!sendResult.ok) {
    await markEmailLogFailed(supabase, log.id, sendResult.error);
    await recordStudioActivity(supabase, {
      actorProfileId: input.actorProfileId,
      action: 'proposal.email_failed',
      clientId: proposal.client_id,
      projectId: proposal.project_id,
      subjectType: 'proposal',
      subjectId: proposal.id,
      metadata: { email_log_id: log.id, error: sendResult.error, resend: true },
    });
    throw new ProposalSendError(
      'provider',
      `Unable to resend proposal email (${sendResult.error}). Check Email history and provider (Graph/Resend).`,
    );
  }

  await markEmailLogSent(supabase, log.id, sendResult.providerMessageId);

  if (
    proposal.status === 'draft' ||
    proposal.status === 'viewed' ||
    proposal.status === 'changes_requested' ||
    proposal.status === 'expired' ||
    proposal.status === 'declined'
  ) {
    await supabase
      .from('proposals')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', proposal.id)
      .in('status', ['draft', 'viewed', 'changes_requested', 'expired', 'declined']);
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'proposal.sent',
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    subjectType: 'proposal',
    subjectId: proposal.id,
    metadata: {
      email_log_id: log.id,
      resend: true,
      recipient_domain: recipient.split('@')[1] || null,
    },
  });

  return {
    emailLogId: log.id,
    recipientEmail: recipient,
    providerMessageId: sendResult.providerMessageId,
  };
}
