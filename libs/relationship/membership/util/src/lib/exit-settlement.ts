import type { FeeScheduleEntry, MembershipModel } from '@okr/shared-models';
import { proRataMonths } from '@okr/shared-util-core';
import { categoryPrice } from './build-positions';

/** Tag of the treasurer task (and idempotency marker) for an exit settlement (spec 1.105). */
export const EXIT_SETTLEMENT_TAG = 'exit-settlement';

export interface InvoiceFacts {
  okey: string; invoiceId: string; accountingTenantId: string; state: string;
  invoiceNo: number; bookingKey: string; invoiceDate: string; title: string;
  totalRappen: number; paidRappen: number;
  positions: { usage: string; year: number; amount: number }[];   // francs; [] for bexio
}
export type InvoiceShape = 'native' | 'bexio';
export type SettlementCase = 'none' | 'paid' | 'unpaid' | 'partial-enough' | 'partial-short' | 'manual';
export type SettlementChoice = 'refund' | 'adjust-invoice' | 'extend';
export type ManualReason = '' | 'no-invoice' | 'ambiguous-invoice' | 'books-mismatch' | 'bexio-entry-year' | 'category-change' | 'no-price' | 'billed-exceeds-invoice';

export interface ExitSettlementInput {
  membership: Pick<MembershipModel, 'dateOfEntry' | 'dateOfExit' | 'category' | 'orgKey'>;
  /** memberships of the same person in the same org overlapping the exit year, incl. this one */
  overlappingMemberships: number;
  /** fee plan entry for the exit year */
  schedule: FeeScheduleEntry | undefined;
  categoryLists: Record<string, Record<string, number>>;
  /** OrgModel.membershipCategoryKey */
  defaultCategoryList: string;
  /** accounting-configs okey resolved from orgKey */
  booksId: string;
  /** candidates for the member in these books, not cancelled */
  invoices: InvoiceFacts[];
  /** StoreDate */
  today: string;
}

export interface ExitSettlement {
  case: SettlementCase;
  exitYear: number; months: number;
  yearlyFr: number; dueFr: number; billedFr: number;
  /** (billed - due) in Rappen */
  overpaidRappen: number;
  /** 0 unless case paid / partial-enough */
  refundRappen: number;
  invoice?: InvoiceFacts; shape?: InvoiceShape;
  choices: SettlementChoice[];
  manualReason: ManualReason;
}

/** Result of the settle callable, shared by the function and the client card. */
export interface SettleResult {
  settlement: ExitSettlement;
  done: boolean;
  decision?: string;
  paymentKey?: string;
  replacementInvoiceKey?: string;
  needsReview?: boolean;
}

/** An invoice imported from bexio has neither an own number nor a booking. */
export function invoiceShape(i: InvoiceFacts): InvoiceShape {
  return i.invoiceNo === 0 && i.bookingKey === '' ? 'bexio' : 'native';
}

function matchesYear(i: InvoiceFacts, year: number, usage: string): boolean {
  if (invoiceShape(i) === 'native') return i.positions.some(p => p.usage === usage && p.year === year);
  return i.invoiceDate.startsWith(String(year)) && i.title.startsWith('Jahresbeitrag');
}

/** The one invoice that billed the membership fee of `year`; `ambiguous` when several match. */
export function pickFeeInvoice(invoices: InvoiceFacts[], year: number, usage: string): { invoice?: InvoiceFacts; ambiguous: boolean } {
  const hits = invoices.filter(i => matchesYear(i, year, usage));
  return { invoice: hits.length === 1 ? hits[0] : undefined, ambiguous: hits.length > 1 };
}

const NONE = (exitYear = 0): ExitSettlement => ({
  case: 'none', exitYear, months: 0, yearlyFr: 0, dueFr: 0, billedFr: 0, overpaidRappen: 0, refundRappen: 0,
  choices: [], manualReason: '',
});

export function computeExitSettlement(input: ExitSettlementInput): ExitSettlement {
  const { membership: m, today } = input;
  const exit = m.dateOfExit ?? '';
  if (!/^\d{8}$/.test(exit) || exit.startsWith('9999') || exit.substring(4) === '1231') return NONE();
  const exitYear = Number(exit.substring(0, 4));
  const thisYear = Number(today.substring(0, 4));
  if (exitYear !== thisYear && exitYear !== thisYear - 1) return NONE(exitYear);
  // only the first pro-rata rule is settled (find)
  const rule = input.schedule?.positions.find(p => p.proRata);
  if (!rule) return NONE(exitYear);

  const yearlyFr = rule.source === 'category'
    ? categoryPrice(rule, m.category, input.categoryLists, input.defaultCategoryList)
    : rule.source === 'manual' ? (rule.amount ?? 0) : 0;
  const months = proRataMonths(m.dateOfEntry, exit, exitYear);
  const dueFr = Math.round(yearlyFr * months / 12);
  const base: ExitSettlement = { ...NONE(exitYear), months, yearlyFr, dueFr };
  const manual = (manualReason: ManualReason, extra: Partial<ExitSettlement> = {}): ExitSettlement =>
    ({ ...base, ...extra, case: 'manual', manualReason, choices: ['extend'] });

  if (!yearlyFr) return manual('no-price');
  if (input.overlappingMemberships > 1) return manual('category-change');

  const { invoice, ambiguous } = pickFeeInvoice(input.invoices, exitYear, rule.usage);
  if (ambiguous) return manual('ambiguous-invoice');
  if (!invoice) return manual('no-invoice');
  const shape = invoiceShape(invoice);
  if (invoice.accountingTenantId !== input.booksId) return manual('books-mismatch', { invoice, shape });
  if (shape === 'bexio' && m.dateOfEntry.startsWith(String(exitYear))) return manual('bexio-entry-year', { invoice, shape });

  const billedFr = shape === 'native'
    ? invoice.positions.filter(p => p.usage === rule.usage && p.year === exitYear).reduce((s, p) => s + p.amount, 0)
    : yearlyFr;
  if (billedFr * 100 > invoice.totalRappen) return manual('billed-exceeds-invoice', { invoice, shape });
  const overpaidRappen = Math.round((billedFr - dueFr) * 100);
  const found: ExitSettlement = { ...base, billedFr, overpaidRappen, invoice, shape };
  if (overpaidRappen <= 0) return { ...found, case: 'none', overpaidRappen: 0 };

  const { paidRappen, totalRappen } = invoice;
  if (paidRappen === 0) {
    return { ...found, case: 'unpaid', choices: shape === 'native' ? ['adjust-invoice', 'extend'] : ['extend'] };
  }
  if (paidRappen >= totalRappen) {
    return { ...found, case: 'paid', refundRappen: Math.min(overpaidRappen, paidRappen), choices: ['refund', 'extend'] };
  }
  const owed = totalRappen - overpaidRappen;
  if (paidRappen >= owed) {
    return { ...found, case: 'partial-enough', refundRappen: Math.min(paidRappen - owed, paidRappen), choices: ['refund', 'extend'] };
  }
  return { ...found, case: 'partial-short', choices: ['extend'] };
}

const chf = (rappen: number): string => `CHF ${(rappen / 100).toFixed(2)}`;
const chfFr = (fr: number): string => chf(Math.round(fr * 100));

export function exitSettlementTaskName(memberLabel: string, s: ExitSettlement): string {
  const head = `Austritt pro rata: ${memberLabel}`;
  switch (s.case) {
    case 'paid': case 'partial-enough': return `${head} (Rückerstattung ${chf(s.refundRappen)})`;
    case 'unpaid': return `${head} (Rechnung anpassen)`;
    case 'partial-short': return `${head} (Teilzahlung prüfen)`;
    case 'manual': return `${head} (manuell prüfen)`;
    default: return head;
  }
}

const MANUAL_TEXT: Record<Exclude<ManualReason, ''>, string> = {
  'no-invoice': 'Keine Beitragsrechnung für das Austrittsjahr gefunden.',
  'ambiguous-invoice': 'Mehrere Beitragsrechnungen für das Austrittsjahr gefunden, keine eindeutige Zuordnung.',
  'books-mismatch': 'Die Rechnung liegt in einer anderen Buchhaltung als die Mitgliedschaft.',
  'bexio-entry-year': 'Eintritt und Austritt im selben Jahr bei einer Bexio-Rechnung: der verrechnete Betrag ist nicht bekannt.',
  'category-change': 'Mehrere Mitgliedschaften im Austrittsjahr (Kategoriewechsel): bitte von Hand abrechnen.',
  'billed-exceeds-invoice': 'Der angenommene Jahresbeitrag ist höher als der Rechnungsbetrag. Bitte von Hand prüfen.',
  'no-price': 'Für die Kategorie ist kein Jahresbeitrag hinterlegt.',
};

export function exitSettlementTaskNotes(s: ExitSettlement, exitViewDate: string): string {
  const lines = [
    `Austrittsdatum: ${exitViewDate}`,
    `Mitglied im Austrittsjahr: ${s.months} von 12 Monaten`,
    `Jahresbeitrag: ${chfFr(s.yearlyFr)}`,
    `Geschuldet pro rata: ${chfFr(s.dueFr)}`,
  ];
  if (s.invoice) {
    if (s.case !== 'manual') lines.push(`Verrechnet: ${chfFr(s.billedFr)}${s.shape === 'bexio' ? ' (Annahme: voller Jahresbeitrag verrechnet)' : ''}`);
    lines.push(`Rechnung ${s.invoice.invoiceId}: Total ${chf(s.invoice.totalRappen)}, bezahlt ${chf(s.invoice.paidRappen)}`);
    if (s.case !== 'manual') lines.push(`Differenz: ${chf(s.overpaidRappen)}`);
    if (s.refundRappen > 0) lines.push(`Rückerstattung: ${chf(s.refundRappen)}`);
  }
  if (s.case === 'partial-short') lines.push('Die bezahlte Teilzahlung deckt den pro rata geschuldeten Betrag nicht: den Rest bitte von Hand abrechnen.');
  if (s.case === 'unpaid' && s.shape === 'bexio') lines.push('Eine Bexio-Rechnung muss in Bexio storniert und neu ausgestellt werden.');
  if (s.case === 'manual' && s.manualReason) lines.push(MANUAL_TEXT[s.manualReason]);
  return lines.join('\n');
}
