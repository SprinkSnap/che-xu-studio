import { describe, expect, it } from 'vitest';
import {
  renderProposalDeliveryEmail,
  renderInvoiceDeliveryEmail,
  renderPaymentConfirmationEmail,
  renderReminderEmail,
  renderInternalNotificationEmail,
} from '../../src/lib/email/templates';
import { sanitizeEmailSubject } from '../../src/lib/email/config';
import {
  addCalendarDays,
  calendarDateInTimeZone,
  diffCalendarDays,
  isInvoiceReminderEligible,
  reminderTypesForInvoiceDay,
} from '../../src/lib/reminders/dates';

describe('email templates', () => {
  it('renders proposal delivery with CTA and plain text', () => {
    const email = renderProposalDeliveryEmail({
      contactName: 'Alex',
      projectName: 'Site Redesign',
      proposalNumber: 'P-1',
      proposalTitle: 'Site Redesign',
      expiresAt: '2026-09-01',
      totalLabel: 'CAD $1,000.00',
      reviewUrl: 'https://chexustudio.com/proposal/abc',
    });
    expect(email.subject).toContain('P-1');
    expect(email.subject).toContain('Che Xu Studio');
    expect(email.html).toContain('Open your proposal');
    expect(email.html).toContain('https://chexustudio.com/proposal/abc');
    expect(email.text).toContain('Review your proposal:');
    expect(email.html).not.toContain('internal');
    expect(email.html).not.toContain('display:inline-block;background:#0B1F33');
  });

  it('renders invoice delivery with pay CTA', () => {
    const email = renderInvoiceDeliveryEmail({
      contactName: 'Alex',
      invoiceNumber: 'INV-1',
      projectName: 'Site Redesign',
      totalMinor: 100_00,
      balanceDueMinor: 100_00,
      currency: 'CAD',
      dueDate: '2026-09-15',
      viewUrl: 'https://chexustudio.com/invoice/xyz',
    });
    expect(email.subject).toContain('INV-1');
    expect(email.html).toContain('View &amp; Pay Invoice');
    expect(email.text).toContain('View & Pay Invoice');
  });

  it('does not claim deposit activation unless project transitioned', () => {
    const generic = renderPaymentConfirmationEmail({
      contactName: 'Alex',
      invoiceNumber: 'INV-1',
      amountMinor: 50_00,
      balanceDueMinor: 0,
      currency: 'CAD',
      paidAtLabel: 'Aug 15, 2026',
      projectName: 'Site',
      paymentMethod: 'Visa ending in 4242',
      invoiceUrl: null,
      depositActivated: false,
      finalCompleted: false,
    });
    expect(generic.html).not.toContain('project is now active');

    const activated = renderPaymentConfirmationEmail({
      contactName: 'Alex',
      invoiceNumber: 'INV-1',
      amountMinor: 50_00,
      balanceDueMinor: 0,
      currency: 'CAD',
      paidAtLabel: 'Aug 15, 2026',
      projectName: 'Site',
      paymentMethod: null,
      invoiceUrl: null,
      depositActivated: true,
    });
    expect(activated.html).toContain('project is now active');
  });

  it('states remaining balance for partial payments', () => {
    const email = renderPaymentConfirmationEmail({
      contactName: 'Alex',
      invoiceNumber: 'INV-1',
      amountMinor: 40_00,
      balanceDueMinor: 60_00,
      currency: 'CAD',
      paidAtLabel: 'Aug 15, 2026',
      projectName: 'Site',
      paymentMethod: null,
      invoiceUrl: null,
    });
    expect(email.html).toContain('Remaining balance');
    expect(email.text).toContain('Remaining balance');
  });

  it('renders reminder and internal notification templates', () => {
    const reminder = renderReminderEmail({
      kind: 'overdue',
      contactName: 'Alex',
      invoiceNumber: 'INV-1',
      balanceDueMinor: 100_00,
      currency: 'CAD',
      dueDate: '2026-08-01',
      projectName: 'Site',
      days: 7,
      viewUrl: 'https://chexustudio.com/invoice/xyz',
    });
    expect(reminder.subject.toLowerCase()).toContain('overdue');
    expect(reminder.html).toContain('View &amp; Pay Invoice');

    const internal = renderInternalNotificationEmail({
      title: 'Proposal accepted — Client',
      intro: 'Accepted',
      lines: [{ label: 'Client', value: 'Client' }],
      adminUrl: 'https://studio.chexustudio.com/admin/proposals/1',
    });
    expect(internal.html).toContain('/admin/proposals/1');
    expect(internal.text).toContain('/admin/proposals/1');
  });

  it('sanitizes subject CRLF', () => {
    expect(sanitizeEmailSubject('Hello\r\nWorld')).toBe('Hello World');
  });
});

describe('reminder eligibility + schedule', () => {
  const settings = {
    remindersEnabled: true,
    businessTimezone: 'America/Toronto',
    beforeDueDays: 3,
    dueDayEnabled: true,
    overdueDays: [3, 7],
  };

  it('computes calendar days and timezone dates', () => {
    expect(addCalendarDays('2026-08-15', 3)).toBe('2026-08-18');
    expect(diffCalendarDays('2026-08-15', '2026-08-18')).toBe(3);
    expect(calendarDateInTimeZone(new Date('2026-08-15T16:00:00.000Z'), 'UTC')).toBe(
      '2026-08-15',
    );
  });

  it('selects before_due / due_today / overdue correctly', () => {
    expect(
      reminderTypesForInvoiceDay({
        dueDate: '2026-08-18',
        businessToday: '2026-08-15',
        settings,
      }).map((r) => r.type),
    ).toEqual(['before_due']);

    expect(
      reminderTypesForInvoiceDay({
        dueDate: '2026-08-19',
        businessToday: '2026-08-15',
        settings,
      }),
    ).toEqual([]);

    expect(
      reminderTypesForInvoiceDay({
        dueDate: '2026-08-15',
        businessToday: '2026-08-15',
        settings,
      }).map((r) => r.type),
    ).toEqual(['due_today']);

    expect(
      reminderTypesForInvoiceDay({
        dueDate: '2026-08-12',
        businessToday: '2026-08-15',
        settings,
      }).map((r) => r.type),
    ).toEqual(['overdue_3_days']);

    expect(
      reminderTypesForInvoiceDay({
        dueDate: '2026-08-08',
        businessToday: '2026-08-15',
        settings,
      }).map((r) => r.type),
    ).toEqual(['overdue_7_days']);
  });

  it('excludes paid/void/disabled invoices', () => {
    expect(
      isInvoiceReminderEligible({
        status: 'sent',
        balance_due_minor: 100,
        due_date: '2026-08-20',
        payment_reminders_enabled: true,
      }),
    ).toBe(true);

    expect(
      isInvoiceReminderEligible({
        status: 'paid',
        balance_due_minor: 0,
        due_date: '2026-08-20',
      }),
    ).toBe(false);

    expect(
      isInvoiceReminderEligible({
        status: 'void',
        balance_due_minor: 100,
        due_date: '2026-08-20',
      }),
    ).toBe(false);

    expect(
      isInvoiceReminderEligible({
        status: 'sent',
        balance_due_minor: 100,
        due_date: '2026-08-20',
        payment_reminders_enabled: false,
      }),
    ).toBe(false);
  });
});
