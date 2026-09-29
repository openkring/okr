import type { Firestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection } from '@okr/shared-models';

interface FileSource { file(path: string): { download(): Promise<[Buffer]> } }

/**
 * Reads a voucher/PDF migrated from bexio (spec 1.68) from the Cloud-Functions-only prefix
 * tenant/{tid}/private/**. Returns base64, or null when the key is empty, the doc is missing,
 * or the doc belongs to none of `tenantIds`. Authorization is the caller's job.
 */
export async function readFinanceDocument(db: Firestore, bucket: FileSource, documentKey: string, tenantIds: string[]): Promise<string | null> {
  if (!documentKey) return null;
  const data = (await db.collection(FinanceDocumentCollection).doc(documentKey).get()).data();
  const docTenants = (data?.['tenants'] as string[] | undefined) ?? [];
  if (!data || !docTenants.some(t => tenantIds.includes(t))) return null;
  const [buf] = await bucket.file(String(data['fullPath'])).download();
  return buf.toString('base64');
}
