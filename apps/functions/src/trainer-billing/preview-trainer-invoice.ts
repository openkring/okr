/**
 * Callable `previewTrainerInvoice({ agreementKey, month })` (spec 1.167 §7.4): the PDF the trainer would send,
 * with the «Entwurf» watermark and the number the template gives with the current counter (not incremented).
 * Nothing is stored: the same refusals as a send except `already-sent` and `duplicate-number`.
 *
 * Ruling R2: `renderDocument` has no in-memory mode, so the PDF is rendered `ephemeral` into the PRIVATE
 * bucket (it carries the trainer's IBAN; the default bucket is readable through imgix), read back, returned
 * as base64 and deleted.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { TrainerInvoiceCollection } from '@okr/shared-models';
import { trainerInvoiceKey } from '@okr/finance-trainer-billing-util';
import { generateRandomString } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { ExistingInvoice, invoiceFilename, planSend } from './send-trainer-invoice';
import { isDocKey, isMonth, loadInvoiceContext, renderTrainerInvoicePdf } from './trainer-invoice-context';

const REGION = 'europe-west6';
const CF_NAME = 'previewTrainerInvoice';

export async function previewInvoice(db: Firestore, uid: string, data: { agreementKey?: unknown; month?: unknown }, now: Date):
  Promise<{ pdfBase64: string; filename: string }> {
  const { agreementKey, month } = data ?? {};
  if (!isDocKey(agreementKey)) throw new HttpsError('invalid-argument', 'agreementKey is required');
  if (!isMonth(month)) throw new HttpsError('invalid-argument', 'month must be YYYY-MM');

  const ctx = await loadInvoiceContext(db, { uid, agreementKey, month }, now);
  const invoiceKey = trainerInvoiceKey(agreementKey, month);
  // only a rejected invoice matters to the preview (it keeps its number); a sent one is no refusal here
  const stored = ctx.agreement ? (await db.collection(TrainerInvoiceCollection).doc(invoiceKey).get()).data() as ExistingInvoice : undefined;
  const plan = planSend(ctx, stored?.state === 'rejected' ? stored : undefined, false);
  if ('refusal' in plan) {
    const { refusal, ...extra } = plan;
    throw new HttpsError('failed-precondition', `${CF_NAME}: ${refusal}`, { reason: refusal, ...extra });
  }

  const filename = invoiceFilename(`Entwurf-${plan.invoiceNo}`);
  const path = `tenant/${ctx.tenantId}/private/finance/trainer-invoice-previews/${invoiceKey}-${generateRandomString(12)}.pdf`;
  const file = privateBucket().file(path);
  try {
    await renderTrainerInvoicePdf(ctx, {
      invoiceNo: plan.invoiceNo, invoiceDate: plan.invoiceDate, dueDate: plan.dueDate, priced: plan.priced, draft: true,
      sink: { bucket: privateBucket(), path }, filename,
    });
    const [bytes] = await file.download();
    logger.info(`${CF_NAME}: previewed ${invoiceKey} (${bytes.length} bytes)`);
    return { pdfBase64: bytes.toString('base64'), filename };
  } finally {
    await file.delete({ ignoreNotFound: true }).catch((e) => logger.warn(`${CF_NAME}: could not delete ${path}`, { detail: String(e?.message ?? e).slice(0, 200) }));
  }
}

/** Callable: `{ agreementKey, month }` → `{ pdfBase64, filename }`; refusals carry `details.reason`. */
export const previewTrainerInvoice = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like previewInvoicePdf.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<{ agreementKey: string; month: string }>): Promise<{ pdfBase64: string; filename: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    return previewInvoice(getFirestore(), request.auth?.uid ?? '', request.data, new Date());
  },
);
