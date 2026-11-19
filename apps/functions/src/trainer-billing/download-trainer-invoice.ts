/**
 * Callable `downloadTrainerInvoice({ invoiceKey })` (spec 1.167 §7.4): the sent PDF, read from the private
 * bucket (finance-documents are private — imgix reads the whole default bucket). Allowed to the trainer of the
 * invoice and to treasurer, admin and privileged of its tenant (§6), as the `trainer-invoices` read rule.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, TrainerInvoiceCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { invoiceFilename } from './send-trainer-invoice';
import { isDocKey } from './trainer-invoice-context';

const REGION = 'europe-west6';
const CF_NAME = 'downloadTrainerInvoice';

/** Pure: may this caller read this trainer invoice? Same tenant, and its trainer or treasurer/admin/privileged. */
export function mayReadTrainerInvoice(
  caller: { tenantId: string; personKey: string; roles: Record<string, unknown> },
  invoice: { tenants?: unknown; personKey?: unknown },
): boolean {
  const tenants = Array.isArray(invoice.tenants) ? invoice.tenants : [];
  if (!caller.tenantId || !tenants.includes(caller.tenantId)) return false;
  if (caller.personKey && invoice.personKey === caller.personKey) return true;
  return ['treasurer', 'admin', 'privileged'].some((r) => caller.roles[r] === true);
}

export async function downloadInvoice(db: Firestore, uid: string, data: { invoiceKey?: unknown }): Promise<{ pdfBase64: string; filename: string }> {
  const invoiceKey = data?.invoiceKey;
  if (!isDocKey(invoiceKey)) throw new HttpsError('invalid-argument', 'invoiceKey is required');
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  const caller = {
    tenantId: Array.isArray(user['tenants']) && typeof user['tenants'][0] === 'string' ? user['tenants'][0] : '',
    personKey: typeof user['personKey'] === 'string' ? user['personKey'] : '',
    roles: (user['roles'] as Record<string, unknown> | undefined) ?? {},
  };
  const invoice = (await db.collection(TrainerInvoiceCollection).doc(invoiceKey).get()).data();
  // a missing and a foreign invoice look the same to the caller
  if (!invoice || !mayReadTrainerInvoice(caller, invoice)) throw new HttpsError('permission-denied', 'not allowed to read this trainer invoice');

  const documentKey = String(invoice['documentKey'] ?? '');
  const doc = documentKey ? (await db.collection(FinanceDocumentCollection).doc(documentKey).get()).data() : undefined;
  const fullPath = String(doc?.['fullPath'] ?? '');
  if (!fullPath.startsWith(`tenant/${caller.tenantId}/private/finance/trainer-invoices/`)) throw new HttpsError('not-found', 'no PDF for this trainer invoice');
  const [bytes] = await privateBucket().file(fullPath).download();
  logger.info(`${CF_NAME}: ${invoiceKey} (${bytes.length} bytes)`);
  return { pdfBase64: bytes.toString('base64'), filename: invoiceFilename(String(invoice['invoiceNo'] ?? '')) };
}

/** Callable: `{ invoiceKey }` → `{ pdfBase64, filename }`. */
export const downloadTrainerInvoice = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB' },
  async (request: CallableRequest<{ invoiceKey: string }>): Promise<{ pdfBase64: string; filename: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    return downloadInvoice(getFirestore(), request.auth?.uid ?? '', request.data);
  },
);
