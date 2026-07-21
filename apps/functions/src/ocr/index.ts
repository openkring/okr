import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

import { parseOcrPath } from './ocr-path.util';
import { toCents, ocrResultId } from './ocr-extract.util';
import { geminiExtract } from './gemini-extract';

const REGION = 'europe-west6';
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Collection names (inlined to keep the function bundle self-contained — same convention as task/index.ts).
const OCR_RESULT_COLLECTION = 'ocr-results';
const DOCS_COLLECTION = 'docs';
const ACCOUNTS_COLLECTION = 'accounts';

/** Build a compact "id name" chart-of-accounts list of leaf accounts for the LLM account hint. */
async function loadLeafAccountList(accountingTenantId: string): Promise<string> {
  const db = getFirestore();
  const snap = await db.collection(ACCOUNTS_COLLECTION)
    .where('accountingTenantId', '==', accountingTenantId)
    .where('type', '==', 'leaf')
    .get();
  return snap.docs
    .map(d => `${d.data()['id']} ${d.data()['name'] ?? ''}`.trim())
    .join('\n')
    .slice(0, 8000); // hard cap so the prompt stays small
}

/** Create a DocumentModel voucher for the uploaded file; returns its key. */
async function createVoucher(
  tenantId: string, objectName: string, bucketName: string, mimeType: string,
  size: number, downloadToken: string,
): Promise<string> {
  const db = getFirestore();
  const url = downloadToken
    ? `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media&token=${downloadToken}`
    : '';
  const ref = db.collection(DOCS_COLLECTION).doc();
  await ref.set({
    tenants: [tenantId],
    isArchived: false,
    fullPath: objectName,
    url,
    mimeType,
    size,
    type: 'finance',
    source: 'storage',
    description: path.basename(objectName),
  });
  return ref.id;
}

export const onOcrFileFinalized = onObjectFinalized(
  { region: REGION, secrets: [geminiApiKey] },
  async (event) => {
    const objectName = event.data.name;
    const bucketName = event.data.bucket;
    const contentType = event.data.contentType ?? 'application/octet-stream';
    const generation = String(event.data.generation ?? '');
    const size = Number(event.data.size ?? 0);
    const downloadToken =
      (event.data.metadata?.['firebaseStorageDownloadTokens'] ?? '').split(',')[0] ?? '';

    const parsed = parseOcrPath(objectName);
    if (!parsed) return; // not an OCR path — ignore silently

    const { tenantId, ocrUsage, correlationKey } = parsed;
    const resultId = ocrResultId(objectName, generation);
    const db = getFirestore();
    const resultRef = db.collection(OCR_RESULT_COLLECTION).doc(resultId);

    // Idempotency: a redelivered event must not re-extract if we already produced a result.
    const existing = await resultRef.get();
    if (existing.exists) {
      logger.info(`onOcrFileFinalized: result ${resultId} already exists — skip`);
      return;
    }

    logger.info(`onOcrFileFinalized: "${objectName}" usage=${ocrUsage}`);

    const tempFilePath = path.join(tmpdir(), path.basename(objectName));
    try {
      await admin.storage().bucket(bucketName).file(objectName).download({ destination: tempFilePath });

      const accountingTenantId = tenantId; // convention: accountingTenantId === tenantId
      const documentKey = await createVoucher(tenantId, objectName, bucketName, contentType, size, downloadToken);
      const accountList = ocrUsage === 'paper' ? '' : await loadLeafAccountList(accountingTenantId);

      const raw = await geminiExtract(geminiApiKey.value(), tempFilePath, contentType, ocrUsage, accountList);

      await resultRef.set({
        tenants: [tenantId],
        isArchived: false,
        index: '',
        ocrUsage,
        storagePath: objectName,
        correlationKey,
        documentKey,
        status: 'extracted',
        vendor: raw.vendor ?? '',
        invoiceDate: (raw.invoiceDate ?? '').replace(/\D/g, '').slice(0, 8),
        grossAmount: toCents(raw.grossAmount),
        currency: raw.currency || 'CHF',
        vatLines: (raw.vatLines ?? []).map(v => ({ rate: v.rate ?? 0, amount: toCents(v.amount) })),
        subject: raw.subject ?? '',
        confidence: raw.confidence ?? {},
        matchedRuleKey: '',
        accountKey: '',
        llmProposedAccountKey: '', // resolved to an account key by stage ② (raw returns the account NUMBER)
        llmProposedAccountId: raw.llmProposedAccountId ?? '', // transient hint, resolved in stage ②
        bookingKey: '',
        error: '',
      });
      logger.info(`onOcrFileFinalized: wrote result ${resultId} (vendor="${raw.vendor}")`);
    } catch (error: unknown) {
      logger.error(`onOcrFileFinalized: extraction failed for "${objectName}":`, error);
      await resultRef.set({
        tenants: [tenantId],
        isArchived: false,
        index: '',
        ocrUsage,
        storagePath: objectName,
        correlationKey,
        documentKey: '',
        status: 'failed',
        bookingKey: '',
        error: error instanceof Error ? error.message : String(error),
      }, { merge: true });
    } finally {
      await fs.unlink(tempFilePath).catch(() => undefined);
    }
  },
);
