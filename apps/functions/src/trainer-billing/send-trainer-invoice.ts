/**
 * Callable `sendTrainerInvoice({ agreementKey, month })` (spec 1.167 §7.4): the trainer sends one month of one
 * agreement to the treasurer. Amounts are computed here (D4), never taken from the client.
 *
 * Order: load the context → `planSend` (refusals, number, prices) → render the PDF into the private bucket →
 * ONE transaction that re-reads the invoice doc, the profile counter, the entries and the trainer's other
 * invoices, re-plans and refuses `concurrent-send` when the plan differs from the rendered one (Ruling R1:
 * the PDF must never carry a number or lines another send took) → writes the finance-document, the trainer
 * invoice, the entries (`invoiced`), the counter and — native books — the draft bill. After the transaction:
 * the treasurer's task and the bill's history.
 *
 * The PDF path carries a run nonce: two concurrent sends never overwrite each other's file, the loser deletes
 * its own, and the winner's finance-document points at exactly the PDF its transaction priced.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import {
  AppConfigCollection, BillCollection, TrainerAgreementCollection, TrainerAgreementModel, FinanceDocumentCollection, TrainerInvoiceCollection, TrainerInvoiceState, TrainerProfileCollection, TrainerProfileModel,
  WorkEntryCollection, WorkEntryModel,
} from '@okr/shared-models';
import {
  formatInvoiceNo, lastDayOfMonth, monthTitleDe, priceEntries, PricedInvoice, roundQuantity, sendRefusal, SendRefusal, templateUsesCounter, trainerInvoiceKey,
} from '@okr/finance-trainer-billing-util';
import { addDuration, generateRandomString, publicAppOrigin } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { writeDraftBillTx } from '../bill/bill-draft';
import type { CleanBillLine } from '../bill/bill.logic';
import { writeFinanceHistory } from '../finance-history/finance-history';
import { withoutUndefined } from '../invoice/invoice.logic';
import { InvoiceContext, isDocKey, isMonth, loadInvoiceContext, renderTrainerInvoicePdf } from './trainer-invoice-context';

const REGION = 'europe-west6';
const CF_NAME = 'sendTrainerInvoice';
const TASK_COLLECTION = 'tasks';
const DEFAULT_PAYMENT_TERM_DAYS = 30;
const MAX_PAYMENT_TERM_DAYS = 365;
const MAX_HOURS_PER_ENTRY = 24;
const MAX_DAYS_PER_ENTRY = 1;

/** Every reason the callable refuses with (`details.reason`). */
export type TrainerSendRefusal =
  | Exclude<SendRefusal, ''>
  | 'invalid-entry' | 'no-rate' | 'no-vat-code' | 'no-account'
  | 'concurrent-send' | 'qr-iban-only';

export type PlanRefusal = { refusal: TrainerSendRefusal; serviceKey?: string; entryKey?: string };

export interface SendPlan {
  invoiceKey: string;
  invoiceNo: string;
  /** the profile's counter after this send (unchanged unless the template uses {n}) */
  nextNumber: number;
  usesCounter: boolean;
  invoiceDate: string;
  dueDate: string;
  entryKeys: string[];
  priced: PricedInvoice;
  /** '' on books kept outside Kring (bexio): no bill, only the task */
  billKey: string;
  billLines: CleanBillLine[];
}

/** The stored trainer invoice of agreement × month, as far as planning needs it. */
export type ExistingInvoice = { state?: TrainerInvoiceState; invoiceNo?: string } | undefined;

function counterOf(profile: TrainerProfileModel | undefined): number {
  const n = profile?.nextNumber;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : 1;
}

function paymentTermOf(profile: TrainerProfileModel | undefined): number {
  const d = profile?.paymentTermDays;
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= MAX_PAYMENT_TERM_DAYS ? d : DEFAULT_PAYMENT_TERM_DAYS;
}

/**
 * The invoice number a send would print (D6): a rejected invoice keeps its number when the template has no
 * `{n}`; otherwise the template with the profile's current counter.
 */
export function candidateInvoiceNo(profile: TrainerProfileModel | undefined, month: string, existing: ExistingInvoice): string {
  const template = profile?.numberTemplate ?? '';
  if (existing?.state === 'rejected' && typeof existing.invoiceNo === 'string' && existing.invoiceNo && !templateUsesCounter(template)) {
    return existing.invoiceNo;
  }
  return formatInvoiceNo(template, month, counterOf(profile));
}

/** The entries this send bills: open, live, of this agreement, person and month. */
function openEntriesOfMonth(ctx: InvoiceContext): WorkEntryModel[] {
  const first = `${ctx.month.replace('-', '')}01`;
  const last = lastDayOfMonth(ctx.month);
  return ctx.entries.filter((e) => e.agreementKey === ctx.agreementKey && e.personKey === ctx.callerPersonKey && e.state === 'open'
    && e.isArchived !== true && typeof e.date === 'string' && e.date >= first && e.date <= last);
}

/**
 * The first entry whose quantity is not a plausible amount of its unit: finite, ≤ 24 h / ≤ 1 day, and > 0 AFTER
 * rounding (hours to 0.25, days to 0.5) — 0.1 h would otherwise print a CHF 0 line.
 */
function invalidEntry(ctx: InvoiceContext, entries: WorkEntryModel[]): WorkEntryModel | undefined {
  const units = new Map((ctx.agreement?.services ?? []).map((s) => [s.key, s.unit]));
  return entries.find((e) => {
    const q = e.quantity as unknown;
    if (typeof q !== 'number' || !Number.isFinite(q)) return true;
    const unit = units.get(e.serviceKey) === 'day' ? 'day' : 'hour';
    if (roundQuantity(q, unit) <= 0) return true;
    return q > (unit === 'day' ? MAX_DAYS_PER_ENTRY : MAX_HOURS_PER_ENTRY);
  });
}

/**
 * Pure: what a send of `ctx` writes, or why it must refuse. `existing` is the stored invoice of agreement ×
 * month (`already-sent` unless rejected), `numberTaken` whether another invoice of the trainer already has
 * `candidateInvoiceNo`. Order: the send rules (`sendRefusal`) → QR-IBAN only → entry quantities → prices → number.
 * `preview` lets the running month through (Ruling R9 binds the send only, spec §16).
 */
export function planSend(ctx: InvoiceContext, existing: ExistingInvoice, numberTaken: boolean, preview = false): SendPlan | PlanRefusal {
  const entries = ctx.agreement ? openEntriesOfMonth(ctx) : [];
  const refusal = sendRefusal({
    callerPersonKey: ctx.callerPersonKey,
    agreement: ctx.agreement,
    profile: ctx.profile,
    iban: ctx.payee.iban,
    postalOk: ctx.postalOk,
    month: ctx.month,
    todayMonth: `${ctx.today.slice(0, 4)}-${ctx.today.slice(4, 6)}`,
    existingState: existing?.state,
    openEntryCount: entries.length,
    booksTenants: ctx.booksTenants,
    callerTenantId: ctx.tenantId,
    allowCurrentMonth: preview,
  });
  if (refusal) return { refusal };
  // a QR-IBAN takes payments only with a QR reference, and a trainer invoice has none (slip and bill alike)
  if (!ctx.payee.regularIban) return { refusal: 'qr-iban-only' };
  const agreement = ctx.agreement as NonNullable<InvoiceContext['agreement']>;
  const profile = ctx.profile as TrainerProfileModel;

  const bad = invalidEntry(ctx, entries);
  if (bad) return { refusal: 'invalid-entry', entryKey: bad.okey };

  const priced = priceEntries(entries, agreement, { registered: !!profile.vatRegistered, ratePercentByCode: ctx.vatRatePercentByCode }, ctx.defaultAccountKey);
  if ('error' in priced) return { refusal: priced.error, serviceKey: priced.serviceKey };

  if (numberTaken) return { refusal: 'duplicate-number' };
  const usesCounter = templateUsesCounter(profile.numberTemplate ?? '');
  const counter = counterOf(profile);
  const invoiceKey = trainerInvoiceKey(ctx.agreementKey, ctx.month);
  return {
    invoiceKey,
    invoiceNo: candidateInvoiceNo(profile, ctx.month, existing),
    nextNumber: usesCounter ? counter + 1 : counter,
    usesCounter,
    invoiceDate: ctx.today,
    dueDate: addDuration(ctx.today, { days: paymentTermOf(profile) }),
    entryKeys: entries.map((e) => e.okey),
    priced,
    billKey: ctx.nativeBooks ? `ti-${invoiceKey}` : '',
    billLines: ctx.nativeBooks ? priced.billLines.map((l) => ({ ...l, projectKey: '' })) : [],
  };
}

/** What the rendered PDF depends on and the transaction must find unchanged: number, entries, amounts. */
export function planFingerprint(p: SendPlan): string {
  return JSON.stringify([p.invoiceNo, p.nextNumber, p.dueDate, p.priced.lines.map((l) => [l.workEntryKey, l.date, l.serviceKey, l.quantity, l.amount]), p.priced.total]);
}

function refuse(r: PlanRefusal): HttpsError {
  const { refusal, ...extra } = r;
  return new HttpsError('failed-precondition', `${CF_NAME}: ${refusal}`, { reason: refusal, ...extra });
}

/** A file name safe for storage and download, from a free-text invoice number. */
export function invoiceFilename(invoiceNo: string): string {
  return `Rechnung-${invoiceNo.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'Trainer'}.pdf`;
}

/** Another invoice of the trainer already carries `invoiceNo` (D6). */
function numberTakenIn(docs: { id: string; data: () => Record<string, unknown> }[], invoiceKey: string, invoiceNo: string): boolean {
  return docs.some((d) => d.id !== invoiceKey && d.data()['invoiceNo'] === invoiceNo);
}

async function deleteQuietly(path: string): Promise<void> {
  try {
    await privateBucket().file(path).delete({ ignoreNotFound: true });
  } catch (e) {
    logger.warn(`${CF_NAME}: could not delete ${path}`, { detail: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

/** The work of the callable, Firestore and the clock injected. */
export async function sendInvoice(db: Firestore, uid: string, data: { agreementKey?: unknown; month?: unknown }, now: Date):
  Promise<{ invoiceKey: string; invoiceNo: string; billKey: string }> {
  const { agreementKey, month } = data ?? {};
  if (!isDocKey(agreementKey)) throw new HttpsError('invalid-argument', 'agreementKey is required');
  if (!isMonth(month)) throw new HttpsError('invalid-argument', 'month must be YYYY-MM');

  // ---- 1. context and plan (before anything is rendered) ----
  const ctx = await loadInvoiceContext(db, { uid, agreementKey, month }, now);
  const invoiceKey = trainerInvoiceKey(agreementKey, month);
  const invoiceRef = db.collection(TrainerInvoiceCollection).doc(invoiceKey);
  const existingPre = (await invoiceRef.get()).data() as ExistingInvoice;
  const candidate = candidateInvoiceNo(ctx.profile, month, existingPre);
  const ownInvoices = db.collection(TrainerInvoiceCollection).where('personKey', '==', ctx.callerPersonKey);
  const takenPre = ctx.callerPersonKey ? numberTakenIn((await ownInvoices.get()).docs, invoiceKey, candidate) : false;
  const pre = planSend(ctx, existingPre, takenPre);
  if ('refusal' in pre) throw refuse(pre);

  // ---- 2. the PDF (slow; outside the transaction, into a path of this run) ----
  const books = String(ctx.agreement?.accountingTenantId ?? '');
  const filename = invoiceFilename(pre.invoiceNo);
  const fullPath = `tenant/${ctx.tenantId}/private/finance/trainer-invoices/${invoiceKey}-${generateRandomString(12)}.pdf`;
  const { sizeBytes } = await renderTrainerInvoicePdf(ctx, {
    invoiceNo: pre.invoiceNo, invoiceDate: pre.invoiceDate, dueDate: pre.dueDate, priced: pre.priced, draft: false,
    sink: { bucket: privateBucket(), path: fullPath }, filename,
  });

  // ---- 3. one transaction: re-read, re-plan, write ----
  const documentKey = `trainer-invoice-${invoiceKey}`;
  const docRef = db.collection(FinanceDocumentCollection).doc(documentKey);
  const profileRef = db.collection(TrainerProfileCollection).doc(ctx.callerPersonKey);
  const agreementRef = db.collection(TrainerAgreementCollection).doc(agreementKey);
  const billRef = pre.billKey ? db.collection(BillCollection).doc(pre.billKey) : undefined;
  let previousPath = '';
  try {
    await db.runTransaction(async (tx) => {
      // reads (all before the first write)
      const invoiceSnap = await tx.get(invoiceRef);
      const profileSnap = await tx.get(profileRef);
      const agreementSnap = await tx.get(agreementRef);
      const entrySnap = await tx.get(db.collection(WorkEntryCollection).where('agreementKey', '==', agreementKey));
      const ownSnap = await tx.get(ownInvoices);
      const docSnap = await tx.get(docRef);
      const billSnap = billRef ? await tx.get(billRef) : undefined;

      const profile = profileSnap.exists ? ({ ...profileSnap.data(), okey: profileSnap.id } as TrainerProfileModel) : undefined;
      if (counterOf(profile) !== counterOf(ctx.profile)) throw refuse({ refusal: 'concurrent-send' });
      // priced from the agreement as it is now: a rate, service or validity change since pricing alters the fingerprint
      const agreement = agreementSnap.exists ? ({ ...agreementSnap.data(), okey: agreementSnap.id } as TrainerAgreementModel) : undefined;
      const txCtx: InvoiceContext = { ...ctx, agreement, profile, entries: entrySnap.docs.map((d) => ({ ...d.data(), okey: d.id }) as WorkEntryModel) };
      const existing = invoiceSnap.data() as ExistingInvoice;
      const plan = planSend(txCtx, existing, numberTakenIn(ownSnap.docs, invoiceKey, candidateInvoiceNo(profile, month, existing)));
      if ('refusal' in plan) throw refuse(plan);
      if (planFingerprint(plan) !== planFingerprint(pre)) throw refuse({ refusal: 'concurrent-send' });
      // the books were checked and the PDF addressed for the books read before rendering
      if (String(agreement?.accountingTenantId ?? '') !== books) throw refuse({ refusal: 'concurrent-send' });
      // a bill under this key that has left draft is live in the books: never reset it to a draft
      const bill = billSnap?.data();
      if (bill && bill['state'] !== 'draft') throw refuse({ refusal: 'already-sent' });
      previousPath = String(docSnap.data()?.['fullPath'] ?? '');

      // writes
      const tenants = [ctx.tenantId];
      tx.set(docRef, withoutUndefined({
        tenants, accountingTenantId: books, isArchived: false,
        index: `n:${filename}`, tags: 'trainer-invoice', folderKeys: [], fullPath, description: '', title: filename,
        altText: filename, type: 'finance', source: 'storage', credit: '', url: '', mimeType: 'application/pdf',
        size: sizeBytes, authorKey: ctx.callerPersonKey, authorName: ctx.trainerName, dateOfDocCreation: plan.invoiceDate,
        dateOfDocLastUpdate: plan.invoiceDate, locationKey: '', hash: '', priorVersionKey: '', version: '', renderings: [],
      }));
      // set, not merge: a resend after a rejection clears rejectedReason/By/At
      tx.set(invoiceRef, withoutUndefined({
        tenants, accountingTenantId: books, personKey: ctx.callerPersonKey, agreementKey, month,
        invoiceNo: plan.invoiceNo, invoiceDate: plan.invoiceDate, dueDate: plan.dueDate, lines: plan.priced.lines,
        subtotal: plan.priced.subtotal, vatAmount: plan.priced.vatAmount, total: plan.priced.total,
        documentKey, billKey: plan.billKey, state: 'sent', rejectedReason: '', rejectedAt: '', isArchived: false,
      }));
      for (const key of plan.entryKeys) tx.update(db.collection(WorkEntryCollection).doc(key), { state: 'invoiced', invoiceKey });
      // always written (unchanged without {n}): two sends of the same trainer then conflict on the profile and
      // serialise, so the duplicate-number check of the second one sees the first one's invoice
      tx.update(profileRef, { nextNumber: plan.nextNumber });
      if (billRef) {
        const senderName = profile?.companyName || ctx.trainerName;
        writeDraftBillTx(tx, db, {
          billKey: plan.billKey, tenantId: ctx.tenantId, accountingTenantId: books,
          header: {
            billId: plan.invoiceNo, title: `Rechnung ${monthTitleDe(month)} ${senderName}`, billDate: plan.invoiceDate, dueDate: plan.dueDate,
            vendor: txCtx.agreement?.person ?? null, notes: '', paymentReference: '', creditorIban: ctx.payee.iban,
          },
          lines: plan.billLines,
          attachments: [documentKey],
          trainerInvoiceKey: invoiceKey,
        }, bill);
      }
    });
  } catch (e) {
    await deleteQuietly(fullPath);
    throw e;
  }
  // the PDF of a rejected predecessor is no longer referenced
  if (previousPath && previousPath !== fullPath && previousPath.startsWith(`tenant/${ctx.tenantId}/private/finance/trainer-invoices/`)) {
    await deleteQuietly(previousPath);
  }

  // ---- 4. after the transaction: the treasurer's task, the bill's history ----
  await writeTreasurerTask(db, ctx, pre, invoiceKey, books);
  if (pre.billKey) {
    await writeFinanceHistory(db, { tenantId: ctx.tenantId, uid, parentKey: `bill.${pre.billKey}`, kind: 'billCreated', details: pre.invoiceNo });
  }
  logger.info(`${CF_NAME}: sent ${invoiceKey} as ${pre.invoiceNo} (books=${books}, bill=${pre.billKey || 'none'}, entries=${pre.entryKeys.length})`);
  return { invoiceKey, invoiceNo: pre.invoiceNo, billKey: pre.billKey };
}

/** CHF of a Rappen amount for the task text: `1'700.00`. */
function chf(rappen: number): string {
  const francs = String(Math.floor(Math.abs(rappen) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${rappen < 0 ? '-' : ''}${francs}.${String(Math.abs(rappen) % 100).padStart(2, '0')}`;
}

/**
 * «Trainerrechnung <Nr.> von <Name>» for the treasurer (reviewAssigneePersonKey, else the first treasurer,
 * else an admin). One task per invoice (deterministic id): a resend after a rejection reopens it. Native books
 * link the draft bill; bexio books carry the link to the trainer page, where the PDF can be downloaded.
 * Best effort: the send has succeeded, a failure here is logged.
 */
async function writeTreasurerTask(db: Firestore, ctx: InvoiceContext, plan: SendPlan, invoiceKey: string, books: string): Promise<void> {
  const treasurer = ctx.treasurer;
  if (!treasurer?.key) {
    logger.warn(`${CF_NAME}: no treasurer for tenant ${ctx.tenantId} — task for ${invoiceKey} not created`);
    return;
  }
  try {
    const appConfig = (await db.collection(AppConfigCollection).doc(ctx.tenantId).get()).data();
    const trainersUrl = `${publicAppOrigin(appConfig?.['appDomain'] as string | undefined, ctx.tenantId)}/accounting/${books}/trainers/all/c-trainers`;
    const senderName = ctx.profile?.companyName || ctx.trainerName;
    const notes = plan.billKey
      ? `${senderName} hat die Rechnung ${plan.invoiceNo} für ${monthTitleDe(ctx.month)} über CHF ${chf(plan.priced.total)} gesendet. `
        + 'Sie liegt als Entwurf in den Kreditoren, mit dem PDF als Beleg.'
      : `${senderName} hat die Rechnung ${plan.invoiceNo} für ${monthTitleDe(ctx.month)} über CHF ${chf(plan.priced.total)} gesendet. `
        + `Die Bücher werden ausserhalb von Kring geführt: bitte dort erfassen. Das PDF findest du hier: ${trainersUrl}`;
    const person = ctx.agreement?.person;
    await db.collection(TASK_COLLECTION).doc(`trainer-invoice-${invoiceKey}`).set({
      tenants: [ctx.tenantId], isArchived: false,
      name: `Trainerrechnung ${plan.invoiceNo} von ${senderName}`.slice(0, 200), index: '', tags: '',
      notes,
      author: person ?? null,
      assignee: { key: treasurer.key, name1: treasurer.name1, name2: treasurer.name2, modelType: 'person', type: '', subType: '', label: `${treasurer.name1} ${treasurer.name2}`.trim() },
      state: 'initial',
      dueDate: '', completionDate: '',
      priority: 'medium', importance: 'medium',
      calendars: [], rank: '', shareKey: '', parentKey: '',
      relatedModelType: 'trainerInvoice', relatedKey: `trainerInvoice.${invoiceKey}`,
      linkModelType: plan.billKey ? 'bill' : '', linkKey: plan.billKey ? `bill.${plan.billKey}` : '',
      links: [],
    });
  } catch (e) {
    logger.error(`${CF_NAME}: task for ${invoiceKey} not written`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}

/** Callable: `{ agreementKey, month }` → `{ invoiceKey, invoiceNo, billKey }`; refusals carry `details.reason`. */
export const sendTrainerInvoice = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like issueInvoice.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<{ agreementKey: string; month: string }>): Promise<{ invoiceKey: string; invoiceNo: string; billKey: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    return sendInvoice(getFirestore(), request.auth?.uid ?? '', request.data, new Date());
  },
);
