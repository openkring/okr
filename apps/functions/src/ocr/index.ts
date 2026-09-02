import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { parseOcrPath } from './ocr-path.util';
import { toCents, ocrResultId, matchRule, resolveDebitAccount, type OcrRuleLite } from './ocr-extract.util';
import { geminiExtract } from './gemini-extract';
import { emitEvent } from '../workflow/emit';
import { getTodayStr, DateFormat } from '@okr/shared-util-core';

const REGION = 'europe-west6';
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Collection names (inlined to keep the function bundle self-contained — same convention as task/index.ts).
const OCR_RESULT_COLLECTION = 'ocr-results';
const DOCS_COLLECTION = 'docs';
const ACCOUNTS_COLLECTION = 'accounts';
const OCR_RULE_COLLECTION = 'ocr-rules';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const TASK_COLLECTION = 'tasks';
const USERS_COLLECTION = 'users';
const EXPENSE_COLLECTION = 'expenses';

/**
 * One OCR failure, recorded and announced.
 *
 * The status patch is a DIRECT write, not a workflow consequence: a tenant that archives the
 * rule must still see the expense leave 'processing'. The emit is best-effort by construction —
 * runWorkflow never throws — so it cannot fail the OCR pipeline that produced it.
 */
async function reportExpenseOcrFailure(
  tenantId: string, expenseKey: string, message: string, storagePath: string,
): Promise<void> {
  if (!expenseKey) return;
  const db = getFirestore();
  const expenseRef = db.collection(EXPENSE_COLLECTION).doc(expenseKey);
  const snap = await expenseRef.get();
  if (!snap.exists) return;
  const expense = snap.data()!;
  await expenseRef.set({
    status: 'error',
    ocrError: message.slice(0, 500),
    ocrErrorAt: getTodayStr(DateFormat.StoreDateTime),
  }, { merge: true });
  await emitEvent('expense.ocrFailed', tenantId, `expense.${expenseKey}`, {
    personKey: (expense['personKey'] as string) ?? '',
    subjectName: (expense['userName'] as string) ?? '',
    params: {
      error: message.slice(0, 500),
      storagePath,
      // cents → CHF at the emit site: the workflow engine's translate() only substitutes
      // {k} and cannot format, so a raw cents value shows up verbatim in the task name.
      amount: (Number(expense['amountTotal'] ?? 0) / 100).toFixed(2),
      currency: (expense['currency'] as string) ?? 'CHF',
      // the engine puts params.notes into the task notes (engine.ts runStep 'openTask')
      notes: `${message}\nOCR-Beleg: ${storagePath}`,
    },
  });
}

/** Resolve an account NUMBER (id) to its account doc key for the tenant, or '' if not found. */
async function accountKeyById(accountingTenantId: string, accountId: string): Promise<string> {
  if (!accountId) return '';
  const db = getFirestore();
  const snap = await db.collection(ACCOUNTS_COLLECTION)
    .where('accountingTenantId', '==', accountingTenantId)
    .where('id', '==', accountId)
    .limit(1).get();
  return snap.empty ? '' : snap.docs[0].id;
}

/** Find the treasurer person key + name to assign the review task to. */
async function resolveTreasurer(tenantId: string, reviewAssigneePersonKey: string):
  Promise<{ key: string; name1: string; name2: string } | null> {
  const db = getFirestore();
  if (reviewAssigneePersonKey) {
    const snap = await db.collection(USERS_COLLECTION).where('personKey', '==', reviewAssigneePersonKey).limit(1).get();
    if (!snap.empty) {
      const u = snap.docs[0].data();
      return { key: reviewAssigneePersonKey, name1: u['firstName'] ?? '', name2: u['lastName'] ?? '' };
    }
  }
  const treasurerSnap = await db.collection(USERS_COLLECTION)
    .where('tenants', 'array-contains', tenantId)
    .where('roles.treasurer', '==', true)
    .limit(1).get();
  if (!treasurerSnap.empty) {
    const u = treasurerSnap.docs[0].data();
    return { key: u['personKey'] ?? '', name1: u['firstName'] ?? '', name2: u['lastName'] ?? '' };
  }
  // Fallback: no dedicated treasurer configured — assign to the first tenant admin.
  const adminSnap = await db.collection(USERS_COLLECTION)
    .where('tenants', 'array-contains', tenantId)
    .where('roles.admin', '==', true)
    .limit(1).get();
  if (adminSnap.empty) return null;
  const u = adminSnap.docs[0].data();
  return { key: u['personKey'] ?? '', name1: u['firstName'] ?? '', name2: u['lastName'] ?? '' };
}

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
    // Write a COMPLETE DocumentModel: without these, a group-view Files segment
    // (listId 'f:<key>') iterates all docs and crashes on `folderKeys.includes()`.
    folderKeys: [],
    // Same shape as extractTagsFromStoragePath (@okr/content-document-util): tenant tag first, then the
    // subject tag. Every OCR voucher is a finance document (see `type` above), so it is '@tag.finance'
    // rather than the path's '@tag.ocr' segment.
    tags: `@tag.${tenantId},@tag.finance`,
    index: '',
  });
  return ref.id;
}

/**
 * Extract ONE receipt file: download → Gemini → write the ocr-results doc (status 'extracted'),
 * or on failure write status 'failed' + open a treasurer task (and, for expense usage, latch its
 * taskKey onto the expense). No idempotency guard here — callers (onOcrFileFinalized / redoExpenseOcr)
 * decide whether to (re)run. Shared by the storage trigger and the treasurer redo callable.
 */
async function extractReceipt(opts: {
  objectName: string; bucketName: string; contentType: string; size: number;
  downloadToken: string; generation: string; apiKey: string;
}): Promise<void> {
  const { objectName, bucketName, contentType, size, downloadToken, generation, apiKey } = opts;
  const parsed = parseOcrPath(objectName);
  if (!parsed) return;
  const { tenantId, ocrUsage, correlationKey } = parsed;
  const db = getFirestore();
  const resultRef = db.collection(OCR_RESULT_COLLECTION).doc(ocrResultId(objectName, generation));
  const tempFilePath = path.join(tmpdir(), path.basename(objectName));
  try {
    await admin.storage().bucket(bucketName).file(objectName).download({ destination: tempFilePath });
    const accountingTenantId = tenantId;
    const accountList = ocrUsage === 'paper' ? '' : await loadLeafAccountList(accountingTenantId);
    const raw = await geminiExtract(apiKey, tempFilePath, contentType, ocrUsage, accountList);
    const documentKey = await createVoucher(tenantId, objectName, bucketName, contentType, size, downloadToken);
    await resultRef.set({
      tenants: [tenantId], isArchived: false, index: '', ocrUsage,
      storagePath: objectName, correlationKey, documentKey,
      status: 'extracted',
      vendor: raw.vendor ?? '',
      invoiceDate: (raw.invoiceDate ?? '').replace(/\D/g, '').slice(0, 8),
      grossAmount: toCents(raw.grossAmount),
      currency: raw.currency || 'CHF',
      vatLines: (raw.vatLines ?? []).map(v => ({ rate: v.rate ?? 0, amount: toCents(v.amount) })),
      subject: raw.subject ?? '',
      confidence: raw.confidence ?? {},
      matchedRuleKey: '', accountKey: '', llmProposedAccountKey: '',
      llmProposedAccountId: raw.llmProposedAccountId ?? '',
      bookingKey: '', error: '',
    });
    logger.info(`extractReceipt: wrote result ${resultRef.id} (vendor="${raw.vendor}")`);
  } catch (error: unknown) {
    logger.error(`extractReceipt: extraction failed for "${objectName}":`, error);
    await resultRef.set({
      tenants: [tenantId], isArchived: false, index: '', ocrUsage,
      storagePath: objectName, correlationKey, documentKey: '',
      status: 'failed', bookingKey: '',
      error: error instanceof Error ? error.message : String(error),
    }, { merge: true });
    if (ocrUsage === 'expense' && correlationKey) {
      await reportExpenseOcrFailure(
        tenantId, correlationKey,
        error instanceof Error ? error.message : String(error),
        objectName,
      );
    }
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined);
  }
}

export const onOcrFileFinalized = onObjectFinalized(
  { region: REGION, secrets: [geminiApiKey] },
  async (event) => {
    const objectName = event.data.name;
    const bucketName = event.data.bucket;
    const contentType = event.data.contentType ?? 'application/octet-stream';
    const generation = String(event.data.generation ?? '');
    const size = Number(event.data.size ?? 0);
    const downloadToken = (event.data.metadata?.['firebaseStorageDownloadTokens'] ?? '').split(',')[0] ?? '';

    const parsed = parseOcrPath(objectName);
    if (!parsed) return; // not an OCR path — ignore silently

    const resultId = ocrResultId(objectName, generation);
    const db = getFirestore();
    const existing = await db.collection(OCR_RESULT_COLLECTION).doc(resultId).get();
    if (existing.exists) {
      logger.info(`onOcrFileFinalized: result ${resultId} already exists — skip`);
      return;
    }

    logger.info(`onOcrFileFinalized: "${objectName}" usage=${parsed.ocrUsage}`);
    await extractReceipt({ objectName, bucketName, contentType, size, downloadToken, generation, apiKey: geminiApiKey.value() });
  },
);

interface OcrResultDoc {
  ocrUsage: string;
  status: string;
  storagePath: string;
  correlationKey: string;
  documentKey: string;
  vendor: string;
  invoiceDate: string;
  grossAmount: number;
  currency: string;
  subject: string;
  llmProposedAccountId?: string;
  bookingKey: string;
  taskKey?: string;
  tenants: string[];
}

export const onOcrResultWritten = onDocumentWritten(
  { document: `${OCR_RESULT_COLLECTION}/{resultId}`, region: REGION },
  async (event) => {
    const after = event.data?.after?.data() as OcrResultDoc | undefined;
    if (!after) return; // delete

    // Only act on a freshly extracted result that has no booking yet, for a finance usage.
    if (after.status !== 'extracted' || after.bookingKey) return;
    if (after.ocrUsage !== 'expense' && after.ocrUsage !== 'invoice') {
      // paper (or anything non-finance): mark processed, nothing else.
      if (after.ocrUsage === 'paper') {
        await event.data!.after!.ref.set({ status: 'processed' }, { merge: true });
      }
      return;
    }

    const tenantId = after.tenants?.[0];
    if (!tenantId) return;
    const accountingTenantId = tenantId;
    const db = getFirestore();
    const resultRef = event.data!.after!.ref;

    // Guard: accounting must be configured and native (external backends own their ledger).
    const cfgSnap = await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get();
    const cfg = cfgSnap.data();
    if (!cfg) {
      await resultRef.set({ status: 'failed', error: 'no accounting-config' }, { merge: true });
      if (after.ocrUsage === 'expense' && after.correlationKey) {
        await reportExpenseOcrFailure(
          tenantId, after.correlationKey,
          'Die Buchhaltung ist für diesen Mandanten noch nicht konfiguriert.',
          after.storagePath,
        );
      } else {
        await createReviewTask(tenantId, cfg?.['reviewAssigneePersonKey'] ?? '', 'OCR: keine Buchhaltungs-Konfiguration', after);
      }
      return;
    }
    if ((cfg['accountingBackend'] ?? 'native') !== 'native') {
      // External backend owns the ledger — no local booking, but the treasurer must still be
      // notified to book the receipt in the external system (e.g. Bexio). See §11 "External backends".
      await handleExternalBackendResult(tenantId, cfg, after, resultRef);
      return;
    }

    // Expense usage: aggregate ALL receipts of one expense into a single forReview booking,
    // keyed deterministically by the expense's own key (idempotent across redeliveries).
    if (after.ocrUsage === 'expense') {
      if (!after.correlationKey) {
        await resultRef.set({ status: 'processed' }, { merge: true });
        return;
      }
      await handleExpenseResult(tenantId, accountingTenantId, cfg, after, resultRef);
      return;
    }

    // ---- invoice: unchanged Round-1 per-file booking (random doc id, amount = OCR grossAmount) ----

    // Resolve the debit account: rule → llm hint → default.
    const rulesSnap = await db.collection(OCR_RULE_COLLECTION).where('tenants', 'array-contains', tenantId).get();
    const rules = rulesSnap.docs.map(d => ({ okey: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as OcrRuleLite[];

    const rule = matchRule(rules, after.ocrUsage, after.vendor);
    const llmAccountKey = await accountKeyById(accountingTenantId, after.llmProposedAccountId ?? '');
    const defaultDebit = cfg['defaultExpenseAccountKey'] ?? '';
    const debitAccountKey = resolveDebitAccount(rule?.accountKey ?? '', llmAccountKey, defaultDebit);
    const creditAccountKey = cfg['employeePayablesAccountKey'] ?? '';

    const amountCents = after.grossAmount ?? 0;
    const currency = after.currency || 'CHF';
    const bookingDate = after.invoiceDate || '';

    // forReview bookings are unnumbered (0); the treasurer's approve/post step assigns the sequence.
    const bookingNo = 0;

    // Write booking header + two lines atomically.
    const bookingRef = db.collection(BOOKING_COLLECTION).doc();
    const debitRef = db.collection(BOOKING_LINE_COLLECTION).doc();
    const creditRef = db.collection(BOOKING_LINE_COLLECTION).doc();
    const batch = db.batch();
    batch.set(bookingRef, {
      tenants: [tenantId], isArchived: false,
      title: (after.subject || after.vendor || 'OCR-Buchung').slice(0, 200),
      date: bookingDate, bookingNo,
      periodKey: '', documentKey: after.documentKey,
      status: 'forReview', accountingTenantId,
      counterparty: after.vendor ? { key: '', name1: '', name2: after.vendor, modelType: 'org', type: '', subType: '', label: after.vendor } : null,
    });
    batch.set(debitRef, {
      tenants: [tenantId], isArchived: false,
      bookingKey: bookingRef.id, accountKey: debitAccountKey,
      debitAmount: { amount: amountCents, currency, periodicity: 'one-time' },
      accountingTenantId,
    });
    batch.set(creditRef, {
      tenants: [tenantId], isArchived: false,
      bookingKey: bookingRef.id, accountKey: creditAccountKey,
      creditAmount: { amount: amountCents, currency, periodicity: 'one-time' },
      accountingTenantId,
    });
    await batch.commit();

    // Latch: write resolution back + mark processed (idempotency — re-delivery sees bookingKey set).
    await resultRef.set({
      status: 'processed',
      matchedRuleKey: rule?.okey ?? '',
      accountKey: debitAccountKey,
      llmProposedAccountKey: llmAccountKey,
      bookingKey: bookingRef.id,
    }, { merge: true });

    // Open a review task for the treasurer (existing onTaskWritten sends the FCM push).
    // Deliberately AFTER the latch above: if task creation throws, the result is already marked
    // processed, so a redelivery cannot create a second booking. taskKey is latched separately.
    const taskKey = await createReviewTask(tenantId, cfg['reviewAssigneePersonKey'] ?? '',
      `Beleg prüfen: ${after.vendor} ${(amountCents / 100).toFixed(2)} ${currency}`, after);
    // Latch the task onto the result so `reviewBooking` can close it from the booking (invoice usage
    // has no expense doc to hang it on — see 2026-08-01-booking-review-ui-design.md §3).
    if (taskKey) await resultRef.set({ taskKey }, { merge: true });

    logger.info(`onOcrResultWritten: booking ${bookingRef.id} forReview (rule=${rule?.okey ?? 'none'})`);
  },
);

/**
 * Expense usage: aggregate all receipts belonging to one expense into exactly ONE forReview
 * booking, keyed deterministically by the expense's own key so redelivery of any receipt's
 * OCR result is idempotent (the transaction below sees the booking already exists and skips
 * re-creating it). The booking is posted at the user's ENTERED amount (expense.amountTotal),
 * not the OCR-extracted amount — the two are only compared for a best-effort mismatch warning.
 */
async function handleExpenseResult(
  tenantId: string,
  accountingTenantId: string,
  cfg: FirebaseFirestore.DocumentData,
  after: OcrResultDoc,
  resultRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const db = getFirestore();
  const correlationKey = after.correlationKey;

  const expenseRef = db.collection(EXPENSE_COLLECTION).doc(correlationKey);
  const expenseSnap = await expenseRef.get();
  const expense = expenseSnap.data();
  if (!expense) {
    await resultRef.set({ status: 'processed' }, { merge: true });
    return;
  }

  // Resolve the debit account: rule → llm hint → default (reads only — must happen before the transaction).
  const rulesSnap = await db.collection(OCR_RULE_COLLECTION).where('tenants', 'array-contains', tenantId).get();
  const rules = rulesSnap.docs.map(d => ({ okey: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as OcrRuleLite[];
  const rule = matchRule(rules, after.ocrUsage, after.vendor);
  const llmAccountKey = await accountKeyById(accountingTenantId, after.llmProposedAccountId ?? '');
  const debitAccountKey = resolveDebitAccount(rule?.accountKey ?? '', llmAccountKey, cfg['defaultExpenseAccountKey'] ?? '');
  const creditAccountKey = cfg['employeePayablesAccountKey'] ?? '';

  const amountCents = expense['amountTotal'] ?? 0;
  const currency = expense['currency'] || after.currency || 'CHF';

  // Guard: booking must have a positive amount and both accounts resolved — else route to a human.
  if (amountCents <= 0 || !debitAccountKey || !creditAccountKey) {
    await resultRef.set({
      status: 'failed',
      error: 'Beleg konnte nicht automatisch verarbeitet werden — bitte manuell erfassen.',
    }, { merge: true });
    await reportExpenseOcrFailure(
      tenantId, correlationKey,
      'Beleg konnte nicht automatisch verarbeitet werden — bitte manuell erfassen.',
      after.storagePath,
    );
    return;
  }

  // Deterministic ids (= expenseKey) make redelivery of any receipt idempotent: the transaction
  // below always targets the SAME booking/lines, so a second (or Nth) receipt for the same
  // expense just attaches its amount-mismatch check, never a second booking.
  const bookingRef = db.collection(BOOKING_COLLECTION).doc(correlationKey);
  const debitRef = db.collection(BOOKING_LINE_COLLECTION).doc(`${correlationKey}-d`);
  const creditRef = db.collection(BOOKING_LINE_COLLECTION).doc(`${correlationKey}-c`);

  const created = await db.runTransaction(async (tx) => {
    // All reads before any write — required by Firestore transactions.
    const bookingSnap = await tx.get(bookingRef);
    if (bookingSnap.exists) return false;

    tx.set(bookingRef, {
      tenants: [tenantId], isArchived: false,
      title: (expense['abstract'] || after.vendor || 'OCR-Beleg').slice(0, 200),
      date: after.invoiceDate || '',
      bookingNo: 0, // forReview bookings are unnumbered; the treasurer's approve/post step assigns the sequence.
      periodKey: '', documentKey: after.documentKey,
      status: 'forReview', accountingTenantId,
      counterparty: after.vendor
        ? { key: '', name1: '', name2: after.vendor, modelType: 'org', type: '', subType: '', label: after.vendor }
        : null,
      notes: '',
    });
    tx.set(debitRef, {
      tenants: [tenantId], isArchived: false,
      bookingKey: correlationKey, accountKey: debitAccountKey,
      debitAmount: { amount: amountCents, currency, periodicity: 'one-time' },
      accountingTenantId,
    });
    tx.set(creditRef, {
      tenants: [tenantId], isArchived: false,
      bookingKey: correlationKey, accountKey: creditAccountKey,
      creditAmount: { amount: amountCents, currency, periodicity: 'one-time' },
      accountingTenantId,
    });
    tx.set(expenseRef, { bookingKey: correlationKey, status: 'validated' }, { merge: true });
    return true;
  });

  // The review task is a workflow consequence now (spec 2026-09-02 §3.2): the engine dedups on
  // (relatedKey, assignee), which is what the `created` guard used to do by hand.
  if (created) {
    await emitEvent('expense.validated', tenantId, `expense.${correlationKey}`, {
      personKey: (expense['personKey'] as string) ?? '',
      subjectName: (expense['userName'] as string) ?? '',
      params: {
        vendor: after.vendor ?? '',
        // cents → CHF at the emit site (translate() cannot format)
        amount: (amountCents / 100).toFixed(2),
        currency,
        bookingKey: correlationKey,
        notes: `OCR-Beleg: ${after.storagePath}`,
      },
    });
  }
  const taskKey = (expense['taskKey'] as string | undefined) ?? '';

  // Latch: write resolution back + mark processed (idempotency — re-delivery sees bookingKey set).
  await resultRef.set({
    status: 'processed',
    matchedRuleKey: rule?.okey ?? '',
    accountKey: debitAccountKey,
    llmProposedAccountKey: llmAccountKey,
    bookingKey: correlationKey,
    taskKey,
  }, { merge: true });

  logger.info(`onOcrResultWritten: expense booking ${correlationKey} forReview (created=${created}, rule=${rule?.okey ?? 'none'})`);

  // Amount-mismatch warning: once all expected receipts have been extracted, compare their
  // summed OCR gross amount against the user-entered total. Best-effort — never fails the result.
  try {
    // Single-field equality only — auto-indexed, no composite index needed (correlationKey is
    // per-expense so this is already selective). Tenant filtering happens in memory below.
    const resultsSnap = await db.collection(OCR_RESULT_COLLECTION)
      .where('correlationKey', '==', correlationKey)
      .get();
    const relevant = resultsSnap.docs
      .map(d => d.data() as OcrResultDoc)
      .filter(r => r.tenants?.includes(tenantId) && (r.status === 'extracted' || r.status === 'processed'));
    const receiptCount = expense['receiptCount'] ?? 0;
    if (relevant.length >= receiptCount) {
      const sum = relevant.reduce((s, r) => s + (r.grossAmount ?? 0), 0);
      if (sum !== amountCents) {
        await bookingRef.set({
          notes: `OCR-Summe CHF ${(sum / 100).toFixed(2)} weicht vom erfassten Betrag CHF ${(amountCents / 100).toFixed(2)} ab — bitte prüfen.`,
        }, { merge: true });
      }
    }
  } catch (err) {
    logger.warn(`handleExpenseResult: amount-mismatch check failed for expense ${correlationKey}`, err);
  }
}

/**
 * External accounting backend (e.g. Bexio owns the ledger): we do NOT create a local booking, but the
 * treasurer must still be told to book the receipt in the external system. For `expense` usage this
 * creates no task itself — it emits `expense.pendingExport` and lets the workflow rules decide
 * (spec 2026-09-02 §3.2). Redelivery of a receipt, and every additional receipt of the same expense,
 * re-emits the event; the engine's `hasOpenTask(relatedKey, assignee)` dedup collapses them onto the
 * one open task, which is what the old deterministic-task-id trick did by hand. The expense itself is
 * left at 'processing' — 'pending-export' is an EVENT name here, never a status write.
 * Other usages (invoice/paper) just store the extraction. The full Bexio integration (document upload +
 * prepared payment) is a separate spec — see 2026-07-21-ocr-cloud-function-design.md §11.
 */
async function handleExternalBackendResult(
  tenantId: string,
  cfg: FirebaseFirestore.DocumentData,
  after: OcrResultDoc,
  resultRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const db = getFirestore();
  const correlationKey = after.correlationKey;

  // Only expense uploads carry a correlationKey to key the task by; other usages store extraction only.
  if (after.ocrUsage !== 'expense' || !correlationKey) {
    await resultRef.set({ status: 'processed' }, { merge: true });
    return;
  }

  const expenseRef = db.collection(EXPENSE_COLLECTION).doc(correlationKey);
  const expense = (await expenseRef.get()).data();
  const amountCents = expense?.['amountTotal'] ?? after.grossAmount ?? 0;
  const currency = expense?.['currency'] || after.currency || 'CHF';

  await emitEvent('expense.pendingExport', tenantId, `expense.${correlationKey}`, {
    personKey: (expense?.['personKey'] as string) ?? '',
    subjectName: (expense?.['userName'] as string) ?? '',
    params: {
      vendor: after.vendor ?? '',
      // cents → CHF at the emit site (translate() cannot format)
      amount: (Number(amountCents) / 100).toFixed(2),
      currency,
      notes: `Externe Buchhaltung — bitte manuell verbuchen.\nOCR-Beleg: ${after.storagePath}`,
    },
  });
  await resultRef.set({ status: 'processed' }, { merge: true });
  logger.info(`onOcrResultWritten: emitted expense.pendingExport for ${correlationKey}`);
}

/** Create a TaskModel assigned to the treasurer. Returns the new task's doc id, or '' if none created. */
async function createReviewTask(
  tenantId: string, reviewAssigneePersonKey: string, name: string, result: Pick<OcrResultDoc, 'storagePath'>,
  resolvedTreasurer?: { key: string; name1: string; name2: string } | null,
): Promise<string> {
  const db = getFirestore();
  const treasurer = resolvedTreasurer !== undefined ? resolvedTreasurer : await resolveTreasurer(tenantId, reviewAssigneePersonKey);
  if (!treasurer || !treasurer.key) {
    logger.warn(`createReviewTask: no treasurer for tenant ${tenantId} — task not created`);
    return '';
  }
  const ref = db.collection(TASK_COLLECTION).doc();
  await ref.set({
    tenants: [tenantId], isArchived: false,
    name: name.slice(0, 200), index: '', tags: '',
    notes: `OCR-Beleg: ${result.storagePath}`,
    author: null,
    assignee: { key: treasurer.key, name1: treasurer.name1, name2: treasurer.name2, modelType: 'person', type: '', subType: '', label: `${treasurer.name1} ${treasurer.name2}`.trim() },
    state: 'initial',
    dueDate: '', completionDate: '',
    priority: 'medium', importance: 'medium',
    calendars: [], rank: '',
  });
  return ref.id;
}

/**
 * Treasurer-only: re-run OCR extraction for an expense whose extraction failed (no booking yet).
 * Deletes the expense's existing ocr-results, resets status to 'processing', and re-extracts each
 * receipt via extractReceipt() — the resulting writes drive onOcrResultWritten (booking + task).
 * Refused once the expense is booked (bookingKey set).
 */
export const redoExpenseOcr = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, secrets: [geminiApiKey] },
  async (request: CallableRequest<{ expenseKey: string }>): Promise<{ reprocessed: number }> => {
    checkAppCheckToken(request as any, 'redoExpenseOcr');
    checkAuthentication(request as any, 'redoExpenseOcr');
    const uid = request.auth!.uid;
    const expenseKey = request.data?.expenseKey;
    if (!expenseKey) throw new HttpsError('invalid-argument', 'expenseKey is required');

    const db = getFirestore();
    const expRef = db.collection(EXPENSE_COLLECTION).doc(expenseKey);
    const expSnap = await expRef.get();
    if (!expSnap.exists) throw new HttpsError('not-found', 'expense not found');
    const expense = expSnap.data()!;
    const tenantId = (expense['tenants'] as string[] | undefined)?.[0] ?? '';

    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    const user = userSnap.data() ?? {};
    const isMember = (user['tenants'] as string[] | undefined)?.includes(tenantId) ?? false;
    const isPrivileged = user['roles']?.['treasurer'] === true || user['roles']?.['admin'] === true;
    if (!isMember || !isPrivileged) {
      throw new HttpsError('permission-denied', 'treasurer role required');
    }
    if (expense['bookingKey']) {
      throw new HttpsError('failed-precondition', 'expense is already booked — redo not allowed');
    }

    // Delete prior ocr-results for this expense so extractReceipt re-writes fresh docs.
    const priorResults = await db.collection(OCR_RESULT_COLLECTION).where('correlationKey', '==', expenseKey).get();
    const batch = db.batch();
    priorResults.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    // Clear the previous failure with the status — a stale message next to 'processing' reads
    // as if the retry had already failed.
    await expRef.set({ status: 'processing', ocrError: '', ocrErrorAt: '' }, { merge: true });

    // Re-extract every receipt in the expense's OCR folder.
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: `tenant/${tenantId}/ocr/expense/${expenseKey}/` });
    let reprocessed = 0;
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      await extractReceipt({
        objectName: file.name,
        bucketName: bucket.name,
        contentType: metadata.contentType ?? 'application/octet-stream',
        size: Number(metadata.size ?? 0),
        downloadToken: (metadata.metadata?.['firebaseStorageDownloadTokens'] as string ?? '').split(',')[0] ?? '',
        generation: String(metadata.generation ?? ''),
        apiKey: geminiApiKey.value(),
      });
      reprocessed++;
    }
    logger.info(`redoExpenseOcr: re-extracted ${reprocessed} receipt(s) for expense ${expenseKey}`);
    return { reprocessed };
  },
);
