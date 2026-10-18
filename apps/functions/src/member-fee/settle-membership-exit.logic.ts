/**
 * Pure rules of the exit settlement callable (spec 1.105 §5): which choice is refused, the
 * deterministic ids that make a retry idempotent, and the texts written into task, invoice and
 * payment. Everything here is free of Firestore so it can be tested directly.
 */
import type { ExitSettlement, InvoiceFacts, SettlementChoice } from '@okr/relationship-membership-util';
import { getRelLogEntry, invoiceShape, noExitSettlement, pickFeeInvoice } from '@okr/relationship-membership-util';
import type { InvoicePositionModel } from '@okr/shared-models';
import { applyDiscounts, toPositionInputs } from '@okr/finance-invoice-util';
import { proRataDescription } from '@okr/shared-util-core';

export type SettleRefusal = 'task-done' | 'choice-not-offered' | 'already-refunded';

const chf = (rappen: number): string => `CHF ${(rappen / 100).toFixed(2)}`;
const DECISION_PREFIX = 'Entschieden von ';

/**
 * Why a choice is refused, or undefined when it may run. A done task refuses everything (the stored
 * decision is returned instead), a choice must be offered by the recomputed case, a refund needs an
 * amount and no live refund for the invoice yet, and only a native invoice can be adjusted.
 */
export function choiceRefusal(s: ExitSettlement, choice: SettlementChoice, taskDone: boolean, existingRefund: boolean): SettleRefusal | undefined {
  if (taskDone) return 'task-done';
  if (!s.choices.includes(choice)) return 'choice-not-offered';
  if (choice === 'adjust-invoice' && s.shape !== 'native') return 'choice-not-offered';
  if (choice === 'refund') {
    if (s.refundRappen <= 0 || !s.invoice) return 'choice-not-offered';
    if (existingRefund) return 'already-refunded';
  }
  return undefined;
}

/** Deterministic: a retry or a second treasurer hits `create` on the same document instead of duplicating. */
export function refundPaymentId(membershipKey: string, exitYear: number): string {
  return `mref-${membershipKey}-${exitYear}`;
}

/** The collecting refund order of the books, per day + generation (same scheme as the expense orders). */
export function refundOrderId(books: string, storeDate: string, n: number): string {
  return `${books}-mref-${storeDate}-${n}`;
}

/** pain.001 MsgId (max 35 characters). */
export function refundMessageId(books: string, storeDate: string, n: number): string {
  const suffix = `-MREF-${storeDate}-${n}`;
  return books.toUpperCase().slice(0, 35 - suffix.length) + suffix;
}

/** Deterministic replacement invoice id, so a retry after a crash finds the draft instead of writing a second one. */
export function replacementInvoiceId(invoiceKey: string): string {
  return `${invoiceKey}-pr`;
}

/** The one line written into the task notes; `storedDecision` reads it back for a done task. */
export function decisionNote(choice: SettlementChoice, deciderName: string, viewDate: string, s: ExitSettlement): string {
  const who = deciderName.trim() || 'unbekannt';
  const head = `${DECISION_PREFIX}${who} am ${viewDate}: `;
  switch (choice) {
    case 'refund': return `${head}Rückerstattung ${chf(s.refundRappen)}`;
    case 'adjust-invoice':
      return `${head}Rechnung ${s.invoice?.invoiceId ?? ''} storniert, neue Rechnung über ${chf(Math.round(s.dueFr * 100))} als Entwurf erstellt`;
    case 'extend': return `${head}Austritt auf 31.12.${s.exitYear} verschoben`;
  }
}

/** Appended to the decision note when the member has no IBAN on file (§5.1). */
export const NO_IBAN_NOTE = ' (keine IBAN hinterlegt: bitte in der Zahlung ergänzen, bevor der Zahlungsauftrag freigegeben wird)';

/** The refund decision line, with the missing-IBAN hint when the payment needs review. */
export function refundDecision(note: string, needsReview: boolean): string {
  return needsReview ? `${note}${NO_IBAN_NOTE}` : note;
}

/** The last decision line of the task notes; '' when none was stored. */
export function storedDecision(notes: string | undefined): string {
  const lines = (notes ?? '').split('\n').filter(l => l.startsWith(DECISION_PREFIX));
  return lines[lines.length - 1] ?? '';
}

/** Appends a line at the end, i.e. below the generated block and the treasurer's own text. */
export function appendTaskNote(notes: string | undefined, line: string): string {
  return notes ? `${notes}\n${line}` : line;
}

/** The membership okey of a task `relatedKey` 'membership.<okey>'; '' for anything else. */
export function membershipKeyOf(relatedKey: string | undefined): string {
  const prefix = 'membership.';
  return relatedKey?.startsWith(prefix) ? relatedKey.substring(prefix.length) : '';
}

/** relLog with the last exit entry (`<date>:X`) replaced by `<year>1231:X`, as the membership editor appends it. */
export function extendedRelLog(relLog: string | undefined, year: number): string {
  const entries = (relLog ?? '').split(',').filter(e => e !== '');
  let last = -1;
  entries.forEach((e, i) => { if (e.endsWith(':X')) last = i; });
  const prior = entries.filter((_, i) => i !== last).join(',');
  return getRelLogEntry(`${year}1231`, 'X', prior || undefined);
}

export function refundReference(year: number): string {
  return `Rückerstattung Jahresbeitrag ${year} pro rata`;
}

export function stornoReason(exitViewDate: string): string {
  return `Austritt per ${exitViewDate}, pro rata`;
}

/** Invoice notes + «Rückerstattung CHF X pro rata, Austritt dd.MM.yyyy», never longer than `maxLength`. */
export function appendInvoiceNote(notes: string, refundRappen: number, exitViewDate: string, maxLength: number): string {
  const line = `Rückerstattung ${chf(refundRappen)} pro rata, Austritt ${exitViewDate}`.substring(0, maxLength);
  if (!notes) return line;
  // the new line is kept whole; the old text gives way
  return `${notes.substring(0, Math.max(0, maxLength - line.length - 1))}\n${line}`;
}

/** A postal address as the free-text lines `parseRecipientAddress` (pain.001) reads back. */
export function postalAddressText(a: { streetName?: string; streetNumber?: string; zipCode?: string; city?: string; countryCode?: string } | undefined): string {
  if (!a) return '';
  const street = [a.streetName, a.streetNumber].filter(Boolean).join(' ');
  const place = [a.zipCode, a.city].filter(Boolean).join(' ');
  return [street, place, a.countryCode || 'CH'].filter(Boolean).join('\n');
}

/** A payment that still counts as a refund of the invoice: everything but rejected or archived. */
export function isLiveRefund(p: { status?: string; isArchived?: boolean }): boolean {
  return p.status !== 'rejected' && p.isArchived !== true;
}

type PositionDoc = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The positions of the replacement invoice (§5.2): all positions of the original in their order, the
 * fee positions of the exit year (`usage` + `year`) replaced by one position of `dueFr` at the place
 * of the first one, keeping its name, account and VAT code. `sortOrder` is renumbered and every percent
 * discount is recomputed from the reduced amounts (`applyDiscounts`, spec 1.84 K5).
 */
export function replacementPositions(positions: PositionDoc[], usage: string, year: number, dueFr: number, months: number, yearlyFr: number): PositionDoc[] {
  const ordered = positions
    .map((p, i) => ({ p, i }))
    .sort((a, b) => num(a.p['sortOrder']) - num(b.p['sortOrder']) || a.i - b.i)
    .map(({ p }) => p);
  const isFee = (p: PositionDoc): boolean => p['invoicePositionUsage'] === usage && num(p['year']) === year;
  const out: PositionDoc[] = [];
  let replaced = false;
  for (const p of ordered) {
    if (!isFee(p)) { out.push(p); continue; }
    if (replaced) continue;
    replaced = true;
    out.push({ ...p, amount: dueFr, description: proRataDescription(months, yearlyFr) });
  }
  const renumbered: PositionDoc[] = out.map((p, i) => ({ ...p, sortOrder: i }));
  const recomputed = applyDiscounts(toPositionInputs(renumbered as unknown as InvoicePositionModel[]));
  return renumbered.map((p, i) => (p['amount'] === recomputed[i].amount ? p : { ...p, amount: recomputed[i].amount }));
}

export type ClaimRefusal = 'adjust-in-progress';

/**
 * The original invoice an adjust-invoice run has claimed the task for (`linkModelType 'invoice'`,
 * `linkKey 'invoice.<okey>'`, set before the storno); '' when the task is not claimed.
 */
export function claimedInvoiceKey(task: { linkKey?: unknown; linkModelType?: unknown }): string {
  if (task.linkModelType !== 'invoice' || typeof task.linkKey !== 'string' || !task.linkKey.startsWith('invoice.')) return '';
  return task.linkKey.substring('invoice.'.length);
}

/** The task fields that claim it for the adjustment of `invoiceKey`. */
export function claimPatch(invoiceKey: string): { linkKey: string; linkModelType: string } {
  return { linkKey: `invoice.${invoiceKey}`, linkModelType: 'invoice' };
}

/** While an adjustment is in progress (storno possibly written), only finishing it is allowed. */
export function claimRefusal(claimedKey: string, choice: SettlementChoice): ClaimRefusal | undefined {
  return claimedKey && choice !== 'adjust-invoice' ? 'adjust-in-progress' : undefined;
}

/**
 * Whether a claimed invoice may be acted on. Task documents are client-writable, so `linkKey` is
 * untrusted: the invoice must be this settlement's fee invoice — the member's, in the tenant and the
 * books, not archived, native, billing the fee (`usage`) of the exit year (same matching as the
 * computation) — still `pending` (before the storno) or `cancelled` (after it), and not replaced yet.
 */
export function isValidClaim(
  c: { facts: InvoiceFacts; receiverKey: string; tenants: string[]; isArchived?: boolean; replaced: boolean },
  e: { memberKey: string; tenantId: string; books: string; usage: string; exitYear: number },
): boolean {
  return !!e.memberKey && c.receiverKey === e.memberKey && c.tenants.includes(e.tenantId) &&
    c.facts.accountingTenantId === e.books && c.isArchived !== true && invoiceShape(c.facts) === 'native' &&
    pickFeeInvoice([c.facts], e.exitYear, e.usage).invoice !== undefined &&
    (c.facts.state === 'pending' || c.facts.state === 'cancelled') && !c.replaced;
}

/** The settlement of a claimed task: the only way forward is to finish the adjustment. */
export function claimedChoices(s: ExitSettlement): ExitSettlement {
  return { ...s, choices: ['adjust-invoice'] };
}

/** `invoices` plus `extra`, unless an invoice with its okey is already there. */
export function withInvoice(invoices: InvoiceFacts[], extra: InvoiceFacts): InvoiceFacts[] {
  return invoices.some(i => i.okey === extra.okey) ? invoices : [...invoices, extra];
}

/** A settlement with nothing to settle, for a done task whose membership can no longer be read. */
export function emptySettlement(): ExitSettlement {
  return noExitSettlement();
}

/**
 * The invoice as re-read inside the refund transaction: it must still exist in the tenant and the
 * books and must not have been cancelled since the computation (a refund of a cancelled invoice would
 * pay back money the books no longer hold as revenue).
 */
export function refundInvoiceRefusal(
  inv: { tenants?: unknown; accountingTenantId?: unknown; state?: unknown } | undefined, tenantId: string, books: string,
): 'state-changed' | undefined {
  if (!inv || !(Array.isArray(inv.tenants) && (inv.tenants as string[]).includes(tenantId))) return 'state-changed';
  if (inv.accountingTenantId !== books || inv.state === 'cancelled') return 'state-changed';
  return undefined;
}
