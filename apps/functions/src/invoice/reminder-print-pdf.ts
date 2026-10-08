import { randomUUID } from 'crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, InvoiceCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { loadOwnedAccountingConfig, refuse } from './invoice-context';
import { mergePdfs, printFilename, printItemRefusal, printItemsRefusal, PrintItem } from './reminder-print.logic';

const REGION = 'europe-west6';
const CF_NAME = 'getReminderPrintPdf';
const LOAD_CHUNK = 10;
const URL_TTL_MS = 10 * 60 * 1000;

/**
 * One print PDF of reminders (spec 1.90 §5.4): per item the reminder PDF, then the invoice PDF when
 * `attachInvoice`, merged in item order. Written to a temporary path of the private bucket (lifecycle-deleted
 * after one day) and handed out as a short-lived signed URL. Marks nothing as sent. Treasurer-only, native books.
 */
export const getReminderPrintPdf = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120 },
  async (request: CallableRequest<{ items?: unknown }>): Promise<{ url: string; filename: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const items = request.data?.items;
    const itemsRefusal = printItemsRefusal(items);
    if (itemsRefusal) throw new HttpsError('invalid-argument', `items: ${itemsRefusal}`);
    const db = getFirestore();
    const bucket = privateBucket();
    const checkedBooks = new Set<string>();
    const loadItem = async (item: PrintItem): Promise<{ parts: Uint8Array[]; invoiceId: string }> => {
      const invoice = (await db.collection(InvoiceCollection).doc(item.invoiceKey).get()).data();
      const attach = item.attachInvoice === true;
      const refusal = printItemRefusal(invoice, tenantId, item.documentKey, attach);
      if (refusal === 'not-found') throw new HttpsError('not-found', `invoice ${item.invoiceKey} not found`);
      if (refusal) throw refuse(refusal, `${item.documentKey} of ${item.invoiceKey}: ${refusal}`);
      const books = String(invoice?.['accountingTenantId'] ?? '');
      if (!checkedBooks.has(books)) {
        await loadOwnedAccountingConfig(db, tenantId, item.invoiceKey, books, 'printed');
        checkedBooks.add(books);
      }
      const invoiceDocKey = typeof invoice?.['documentKey'] === 'string' ? (invoice['documentKey'] as string) : '';
      if (attach && !invoiceDocKey) throw refuse('no-document', `invoice ${item.invoiceKey} has no document`);
      const keys = attach ? [item.documentKey, invoiceDocKey] : [item.documentKey];
      const itemParts = await Promise.all(keys.map(async (key) => {
        const doc = (await db.collection(FinanceDocumentCollection).doc(key).get()).data();
        const path = String(doc?.['fullPath'] ?? '');
        if (!path || !((doc?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
          throw refuse('no-document', `finance-document ${key} not found`);
        }
        const [content] = await bucket.file(path).download();
        return new Uint8Array(content);
      }));
      return { parts: itemParts, invoiceId: String(invoice?.['invoiceId'] ?? item.invoiceKey) };
    };
    const loaded: { parts: Uint8Array[]; invoiceId: string }[] = [];
    const all = items as PrintItem[];
    for (let i = 0; i < all.length; i += LOAD_CHUNK) {
      loaded.push(...(await Promise.all(all.slice(i, i + LOAD_CHUNK).map(loadItem))));
    }
    const parts = loaded.flatMap((l) => l.parts);
    const invoiceIds = loaded.map((l) => l.invoiceId);
    const today = getTodayStr(DateFormat.StoreDate);
    const filename = printFilename(invoiceIds, today);
    const path = `tmp/print/${tenantId}/${randomUUID()}.pdf`;
    const file = bucket.file(path);
    await file.save(Buffer.from(await mergePdfs(parts)), { contentType: 'application/pdf', resumable: false });
    const [url] = await file.getSignedUrl({
      version: 'v4', action: 'read', expires: Date.now() + URL_TTL_MS,
      responseDisposition: `attachment; filename="${filename}"`,
    });
    logger.info(`${CF_NAME}: ${parts.length} part(s) of ${invoiceIds.length} invoice(s) merged (tenant=${tenantId})`);
    return { url, filename };
  },
);
