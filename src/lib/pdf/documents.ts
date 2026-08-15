/**
 * Shared document row helpers — reserve / finalize / list.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import type { Json } from '../supabase/database.types';
import { RENDERER_VERSION, STUDIO_DOCUMENTS_BUCKET } from '../documents/types';
import type { CanonicalDocumentRow, DocumentRecordStatus } from './types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export async function findCanonicalDocument(
  client: AnyClient,
  input: {
    resourceType: 'proposal' | 'invoice' | 'receipt';
    resourceId: string;
    documentType: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
    versionId?: string | null;
  },
): Promise<CanonicalDocumentRow | null> {
  let query = client
    .from('documents')
    .select(
      'id, resource_type, resource_id, version_id, document_type, storage_bucket, storage_path, mime_type, file_size, checksum, status, generation_version, renderer_version, is_canonical, generated_at, created_at',
    )
    .eq('resource_type', input.resourceType)
    .eq('resource_id', input.resourceId)
    .eq('document_type', input.documentType)
    .eq('is_canonical', true)
    .in('status', ['pending', 'ready'])
    .order('generation_version', { ascending: false })
    .limit(1);

  if (input.versionId) {
    query = query.eq('version_id', input.versionId);
  } else {
    query = query.is('version_id', null);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as CanonicalDocumentRow;
}

export async function listDocumentsForResource(
  client: AnyClient,
  input: {
    resourceType: 'proposal' | 'invoice' | 'receipt';
    resourceId: string;
    documentType?: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
  },
): Promise<CanonicalDocumentRow[]> {
  let query = client
    .from('documents')
    .select(
      'id, resource_type, resource_id, version_id, document_type, storage_bucket, storage_path, mime_type, file_size, checksum, status, generation_version, renderer_version, is_canonical, generated_at, created_at',
    )
    .eq('resource_type', input.resourceType)
    .eq('resource_id', input.resourceId)
    .order('generation_version', { ascending: false })
    .limit(20);
  if (input.documentType) query = query.eq('document_type', input.documentType);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CanonicalDocumentRow[];
}

export async function reserveCanonicalDocument(
  client: AnyClient,
  input: {
    resourceType: 'proposal' | 'invoice' | 'receipt';
    resourceId: string;
    documentType: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
    versionId?: string | null;
    createdBy?: string | null;
    storagePathPlaceholder: string;
    generationVersion?: number;
    metadata?: Record<string, Json | undefined>;
  },
): Promise<{ row: CanonicalDocumentRow; created: boolean }> {
  const existing = await findCanonicalDocument(client, {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    documentType: input.documentType,
    versionId: input.versionId,
  });
  if (existing?.status === 'ready') {
    return { row: existing, created: false };
  }
  if (existing?.status === 'pending') {
    return { row: existing, created: false };
  }

  let nextVersion = input.generationVersion ?? 1;
  if (existing?.status === 'failed') {
    nextVersion = existing.generation_version;
    await client
      .from('documents')
      .update({
        status: 'pending',
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    const refreshed = await findCanonicalDocument(client, {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      documentType: input.documentType,
      versionId: input.versionId,
    });
    if (refreshed) return { row: refreshed, created: false };
  }

  const metadata: Record<string, Json> = {};
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      if (v !== undefined) metadata[k] = v;
    }
  }

  const { data, error } = await client
    .from('documents')
    .insert({
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      version_id: input.versionId ?? null,
      document_type: input.documentType,
      storage_bucket: STUDIO_DOCUMENTS_BUCKET,
      storage_path: input.storagePathPlaceholder,
      mime_type: 'application/pdf',
      status: 'pending',
      generation_version: nextVersion,
      renderer_version: RENDERER_VERSION,
      is_canonical: true,
      created_by: input.createdBy ?? null,
      metadata,
    })
    .select(
      'id, resource_type, resource_id, version_id, document_type, storage_bucket, storage_path, mime_type, file_size, checksum, status, generation_version, renderer_version, is_canonical, generated_at, created_at',
    )
    .single();

  if (!error && data) {
    return { row: data as CanonicalDocumentRow, created: true };
  }

  // Unique race — reload
  const raced = await findCanonicalDocument(client, {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    documentType: input.documentType,
    versionId: input.versionId,
  });
  if (raced) return { row: raced, created: false };
  throw new Error(error?.message || 'Unable to reserve document row');
}

export async function markDocumentReady(
  client: AnyClient,
  input: {
    documentId: string;
    storagePath: string;
    fileSize: number;
    checksum: string;
  },
): Promise<void> {
  await client
    .from('documents')
    .update({
      status: 'ready' satisfies DocumentRecordStatus,
      storage_path: input.storagePath,
      file_size: input.fileSize,
      checksum: input.checksum,
      failure_reason: null,
      generated_at: new Date().toISOString(),
    })
    .eq('id', input.documentId);
}

export async function markDocumentFailed(
  client: AnyClient,
  documentId: string,
  reason: string,
): Promise<void> {
  await client
    .from('documents')
    .update({
      status: 'failed',
      failure_reason: reason.slice(0, 500),
    })
    .eq('id', documentId);
}

export async function supersedeCanonicalDocument(
  client: AnyClient,
  documentId: string,
): Promise<void> {
  await client
    .from('documents')
    .update({
      is_canonical: false,
      status: 'superseded',
    })
    .eq('id', documentId)
    .eq('is_canonical', true);
}
