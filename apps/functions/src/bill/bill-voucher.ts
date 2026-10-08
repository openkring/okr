import { logger } from 'firebase-functions/v2';
import { Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { BillCollection, FinanceDocumentCollection, OcrResultCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { privateBucket } from '../_storage/private-bucket';

/** '' = the scan may be attached to a new bill; otherwise the refusal reason (details.reason). */
export function billScanRefusal(result: Record<string, unknown> | undefined, tenantId: string): string {
  if (!result || !((result['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return 'scan-not-found';
  if (result['ocrUsage'] !== 'bill') return 'scan-wrong-usage';
  if (result['documentKey']) return 'scan-already-attached';
  return '';
}

export function billVoucherPath(tenantId: string, billKey: string, storagePath: string): string {
  return `tenant/${tenantId}/finance/bill/${billKey}/${storagePath.split('/').pop()}`;
}

/** Spec 1.91 §5: scan -> private bucket, finance-documents/bill-{billKey}, bill.attachments; public original deleted. */
export async function attachBillScan(db: Firestore, tenantId: string, accountingTenantId: string, billKey: string, ocrResultKey: string): Promise<void> {
  const resultRef = db.collection(OcrResultCollection).doc(ocrResultKey);
  const result = (await resultRef.get()).data();
  const storagePath = String(result?.['storagePath'] ?? '');
  const src = getStorage().bucket().file(storagePath);
  const [meta] = await src.getMetadata();
  const fullPath = billVoucherPath(tenantId, billKey, storagePath);
  await src.copy(privateBucket().file(fullPath));
  const documentKey = `bill-${billKey}`;
  const name = storagePath.split('/').pop() ?? '';
  const today = getTodayStr(DateFormat.StoreDate);
  // same field set as the bexio-migrated finance-documents (scripts/bexio-archive/mappers.mjs financeDocument)
  await db.collection(FinanceDocumentCollection).doc(documentKey).set({
    tenants: [tenantId], accountingTenantId, isArchived: false,
    index: `n:${name}`, tags: 'bill-scan', folderKeys: [], fullPath, description: '', title: name,
    altText: name, type: 'finance', source: 'storage', credit: '', url: '',
    mimeType: String(meta.contentType ?? 'application/octet-stream'), size: Number(meta.size ?? 0),
    authorKey: '', authorName: '', dateOfDocCreation: today, dateOfDocLastUpdate: today, locationKey: '',
    hash: '', priorVersionKey: '', version: '', renderings: [],
  });
  await db.collection(BillCollection).doc(billKey).update({ attachments: [documentKey] });
  await resultRef.set({ documentKey }, { merge: true });
  await src.delete().catch((e) => logger.warn(`attachBillScan: could not delete ${storagePath}`, e));
}
