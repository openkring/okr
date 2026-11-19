import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import {
  BillModel,
  CalEventModel,
  MoneyModel,
  TrainerAgreementModel,
  TrainerInvoiceLine,
  TrainerInvoiceState,
  TrainerProfileModel,
  TrainerService,
  TrainerServiceUnit,
  WorkEntryModel,
} from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, subDuration } from '@okr/shared-util-core';

/**
 * Trainer-Abrechnung (spec 1.167): pure rules shared by the Cloud Functions (pricing, numbering, send checks)
 * and the client (default quantity, overlap validation). Amounts in Rappen, dates StoreDate, months `YYYY-MM`.
 */

/* ---------------------------------------------------------------- rates and validity */

/** The rate valid on `date` (StoreDate): the one with the latest `validFrom <= date`. Order of `rates` is not relied on. */
export function rateOn(service: TrainerService, date: string): MoneyModel | undefined {
  let best: { validFrom: string; amount: MoneyModel } | undefined;
  for (const rate of service.rates ?? []) {
    if (rate.validFrom <= date && (!best || rate.validFrom >= best.validFrom)) best = rate;
  }
  return best?.amount;
}

/** Active = not archived, self-employment confirmed (D9) and `date` within the validity ('' validTo = open). */
export function isAgreementActiveOn(a: TrainerAgreementModel, date: string): boolean {
  if (a.isArchived || !a.selfEmployedConfirmed) return false;
  return (a.validFrom ?? '') <= date && date <= openEnd(a.validTo);
}

/** Inclusive overlap of two validities; an empty `validTo` is an open end (D5). */
export function agreementsOverlap(a: { validFrom: string; validTo: string }, b: { validFrom: string; validTo: string }): boolean {
  return a.validFrom <= openEnd(b.validTo) && b.validFrom <= openEnd(a.validTo);
}

function openEnd(validTo: string | undefined): string {
  return validTo ? validTo : END_FUTURE_DATE_STR;
}

/* ---------------------------------------------------------------- quantities and rounding */

const FULL_DAY_HOURS = 8;
const HALF_DAY_MINUTES = 300; // a partial-day event from 5 h counts as a whole day

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Quantity of a unit, rounded: hours to quarter hours, days to half days. */
function roundQuantity(quantity: number, unit: TrainerServiceUnit): number {
  return unit === 'day' ? roundToStep(quantity, 0.5) : roundToStep(quantity, 0.25);
}

/**
 * Proposed quantity for an entry created from a calendar event. One entry represents one day: a multi-day
 * full-day event proposes the per-day value; the client limits the date to the event's days.
 */
export function defaultQuantity(e: Pick<CalEventModel, 'fullDay' | 'durationMinutes' | 'startDate' | 'endDate'>, unit: TrainerServiceUnit): number {
  if (e.fullDay) return unit === 'day' ? 1 : FULL_DAY_HOURS;
  const minutes = e.durationMinutes ?? 0;
  if (unit === 'day') return minutes >= HALF_DAY_MINUTES ? 1 : 0.5;
  return roundQuantity(minutes / 60, 'hour');
}

/** Swiss commercial rounding to 5 Rappen. */
export function roundTo5Rappen(rappen: number): number {
  return roundToStep(rappen, 5);
}

/* ---------------------------------------------------------------- pricing (D4, D10) */

export type PricedInvoice = {
  lines: TrainerInvoiceLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
  billLines: { title: string; accountKey: string; costCenterKey: string; vatCodeKey: string; amount: number }[];
};

export type PricingError = { error: 'no-rate' | 'no-vat-code' | 'no-account'; serviceKey: string };

/**
 * Prices the entries with the rate valid on each entry's date and freezes it into the lines (D4). Lines are
 * rounded to 5 Rappen and sorted by date, then service. VAT (D10) is added only for a registered trainer, per
 * VAT code on the code's net sum, rounded to 5 Rappen. Bill lines: one per service, gross (net + its VAT share);
 * the VAT of a code is split across its services so that the bill lines always sum up to `total`.
 */
export function priceEntries(
  entries: WorkEntryModel[],
  agreement: TrainerAgreementModel,
  vat: { registered: boolean; ratePercentByCode: Record<string, number> },
  defaultAccountKey: string,
): PricedInvoice | PricingError {
  const services = new Map((agreement.services ?? []).filter((s) => !s.isArchived).map((s) => [s.key, s]));
  const lines: TrainerInvoiceLine[] = [];
  const netByService = new Map<string, number>();

  for (const e of entries) {
    const service = services.get(e.serviceKey);
    const rate = service ? rateOn(service, e.date) : undefined;
    if (!service || !rate) return { error: 'no-rate', serviceKey: e.serviceKey };
    if (!service.accountKey && !defaultAccountKey) return { error: 'no-account', serviceKey: service.key };
    if (vat.registered && !(service.vatCodeKey && vat.ratePercentByCode[service.vatCodeKey] !== undefined)) {
      return { error: 'no-vat-code', serviceKey: service.key };
    }
    const quantity = roundQuantity(e.quantity, service.unit);
    const amount = roundTo5Rappen(quantity * rate.amount);
    lines.push({
      date: e.date,
      serviceKey: service.key,
      serviceName: service.name,
      label: e.label ?? '',
      quantity,
      unit: service.unit,
      rate: rate.amount,
      amount,
      workEntryKey: e.okey,
    });
    netByService.set(service.key, (netByService.get(service.key) ?? 0) + amount);
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.serviceKey.localeCompare(b.serviceKey));

  const serviceKeys = [...netByService.keys()].sort();
  const vatByService = vat.registered ? splitVatPerService(serviceKeys, netByService, services, vat.ratePercentByCode) : new Map<string, number>();

  const subtotal = sum([...netByService.values()]);
  const vatAmount = sum([...vatByService.values()]);
  const billLines = serviceKeys.map((key) => {
    const service = services.get(key) as TrainerService;
    return {
      title: service.name,
      accountKey: service.accountKey || defaultAccountKey,
      costCenterKey: service.costCenterKey ?? '',
      vatCodeKey: vat.registered ? service.vatCodeKey : '',
      amount: (netByService.get(key) ?? 0) + (vatByService.get(key) ?? 0),
    };
  });
  return { lines, subtotal, vatAmount, total: subtotal + vatAmount, billLines };
}

/** VAT per code on the code's net sum (rounded to 5 Rappen), split to its services; the last one takes the rest. */
function splitVatPerService(
  serviceKeys: string[],
  netByService: Map<string, number>,
  services: Map<string, TrainerService>,
  ratePercentByCode: Record<string, number>,
): Map<string, number> {
  const keysByCode = new Map<string, string[]>();
  for (const key of serviceKeys) {
    const code = (services.get(key) as TrainerService).vatCodeKey;
    keysByCode.set(code, [...(keysByCode.get(code) ?? []), key]);
  }
  const result = new Map<string, number>();
  for (const [code, keys] of keysByCode) {
    const percent = ratePercentByCode[code];
    const codeVat = roundTo5Rappen((sum(keys.map((k) => netByService.get(k) ?? 0)) * percent) / 100);
    let allocated = 0;
    keys.forEach((key, i) => {
      const share = i === keys.length - 1 ? codeVat - allocated : roundTo5Rappen(((netByService.get(key) ?? 0) * percent) / 100);
      allocated += share;
      result.set(key, share);
    });
  }
  return result;
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/* ---------------------------------------------------------------- numbering (D6) */

/** Fills `{yyyy}`, `{yy}`, `{mm}` (two digits) and `{n}` (unpadded) of the template for `month` (YYYY-MM). */
export function formatInvoiceNo(template: string, month: string, n: number): string {
  const [yyyy, mm] = month.split('-');
  // split/join, not replaceAll: the functions program compiles against a pre-ES2021 lib
  const fill = (text: string, token: string, value: string): string => text.split(token).join(value);
  return fill(fill(fill(fill(template, '{yyyy}', yyyy), '{yy}', yyyy.slice(-2)), '{mm}', mm.padStart(2, '0')), '{n}', String(n));
}

/** True when the template consumes the per-trainer counter `nextNumber`. */
export function templateUsesCounter(template: string): boolean {
  return template.includes('{n}');
}

/** Document id of the trainer invoice: one per agreement × month (D5). */
export function trainerInvoiceKey(agreementKey: string, month: string): string {
  return `${agreementKey}_${month.replace('-', '')}`;
}

/** Last day of `month` (YYYY-MM) as StoreDate. */
export function lastDayOfMonth(month: string): string {
  return subDuration(addDuration(firstDayOfMonth(month), { months: 1 }), { days: 1 });
}

function firstDayOfMonth(month: string): string {
  return `${month.replace('-', '')}01`;
}

/* ---------------------------------------------------------------- send rules (§7.4) */

export type SendRefusal =
  | ''
  | 'not-owner'
  | 'agreement-inactive'
  | 'profile-incomplete'
  | 'no-iban'
  | 'no-postal'
  | 'future-month'
  | 'already-sent'
  | 'no-entries'
  | 'books-mismatch'
  | 'duplicate-number';

/**
 * Why `sendTrainerInvoice` must refuse, or '' when it may send. Checked in this order: not-owner → books-mismatch →
 * agreement-inactive (active on neither the first nor the last day of the month) → profile-incomplete → no-postal →
 * no-iban → future-month → already-sent (any state but `rejected`) → no-entries. `duplicate-number` is decided
 * by the function after numbering, not here.
 */
export function sendRefusal(c: {
  callerPersonKey: string;
  agreement?: TrainerAgreementModel;
  profile?: TrainerProfileModel;
  iban: string;
  postalOk: boolean;
  month: string;
  todayMonth: string;
  existingState?: TrainerInvoiceState;
  openEntryCount: number;
  booksTenants: string[];
  callerTenantId: string;
}): SendRefusal {
  const a = c.agreement;
  if (!a || !c.callerPersonKey || a.personKey !== c.callerPersonKey) return 'not-owner';
  if (!(c.booksTenants ?? []).includes(c.callerTenantId)) return 'books-mismatch';
  if (!isAgreementActiveOn(a, firstDayOfMonth(c.month)) && !isAgreementActiveOn(a, lastDayOfMonth(c.month))) return 'agreement-inactive';
  if (!isProfileComplete(c.profile, a)) return 'profile-incomplete';
  if (!c.postalOk) return 'no-postal';
  if (!c.iban) return 'no-iban';
  if (c.month > c.todayMonth) return 'future-month';
  if (c.existingState !== undefined && c.existingState !== 'rejected') return 'already-sent';
  if (c.openEntryCount <= 0) return 'no-entries';
  return '';
}

/** A profile needs a sender name (company, else the trainer's name) and a number template. */
function isProfileComplete(profile: TrainerProfileModel | undefined, a: TrainerAgreementModel): boolean {
  if (!profile) return false;
  const personName = `${a.person?.name1 ?? ''} ${a.person?.name2 ?? ''}`.trim();
  return !!(profile.companyName || personName) && !!profile.numberTemplate;
}

/* ---------------------------------------------------------------- status mirror (§7.6) */

/** Trainer invoice state mirrored from its Kreditor; `undefined` = no mirror (deletion goes via rejectTrainerInvoice). */
export function trainerInvoiceStateForBill(billState: BillModel['state'] | 'deleted'): TrainerInvoiceState | undefined {
  switch (billState) {
    case 'draft':
      return 'sent';
    case 'todo':
    case 'overdue':
      return 'booked';
    case 'paid':
      return 'paid';
    default:
      return undefined;
  }
}

/* ---------------------------------------------------------------- invoice PDF payload (§8) */

const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DEFAULT_VAT_NOTE = 'Rechnungsbetrag netto, nicht mehrwertsteuerpflichtig.';

/**
 * CHF of a Rappen amount, Swiss-grouped with two decimals: 170000 → `1'700.00`. Grouped by hand, not by
 * toLocaleString, whose de-CH separator differs between ICU builds (same rule as formatChfAmount in
 * finance-collection-util, which this util lib cannot import: that lib depends on Angular).
 */
function chfText(rappen: number): string {
  const abs = Math.abs(Math.round(rappen || 0));
  const francs = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const text = `${francs}.${String(abs % 100).padStart(2, '0')}`;
  return rappen < 0 && abs > 0 ? `-${text}` : text;
}

/** `20260830` → `30. August 2026` (de-CH long date). */
function longDateDe(storeDate: string): string {
  const iso = convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.IsoDate);
  const [yyyy, mm, dd] = iso.split('-');
  return `${Number(dd)}. ${MONTH_NAMES_DE[Number(mm) - 1]} ${yyyy}`;
}

/** `2026-07` → `Juli 2026`. */
export function monthTitleDe(month: string): string {
  const [yyyy, mm] = month.split('-');
  return `${MONTH_NAMES_DE[Number(mm) - 1]} ${yyyy}`;
}

/** `3 Std.`, `1.5 Std.`, `1 Tag`, `0.5 Tage`. */
function quantityText(quantity: number, unit: TrainerServiceUnit): string {
  const q = String(quantity);
  if (unit === 'day') return `${q} ${quantity === 1 ? 'Tag' : 'Tage'}`;
  return `${q} Std.`;
}

/** IBAN in groups of four: `CH93 0076 2011 6238 5295 7`. */
function ibanText(iban: string): string {
  return iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * The Handlebars payload of the `trainer-invoice` template (§8), all texts formatted de-CH. `logoUrl` is an
 * already resolved image URL (imgix, PNG) or '' — the profile's logo storage path is never printed. The
 * `amount` and `qrMessage` fields feed the QR slip (`buildQrSlipData`); the payer is not filled in.
 * A VAT-registered trainer gets `subtotalText` + `vatLine`, an unregistered one `vatNote` (D10).
 */
export function buildTrainerInvoicePayload(p: {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  month: string;
  profile: TrainerProfileModel;
  trainerName: string;
  trainerAddress: string[];
  recipientName: string;
  recipientAddress: string[];
  priced: PricedInvoice;
  iban: string;
  vatRatePercent?: number;
  bankName?: string;
  logoUrl?: string;
}): Record<string, unknown> {
  const { profile, priced } = p;
  const registered = !!profile.vatRegistered;
  const payload: Record<string, unknown> = {
    logoUrl: p.logoUrl ?? '',
    senderName: profile.companyName || p.trainerName,
    senderAddress: p.trainerAddress,
    recipientName: p.recipientName,
    recipientAddress: p.recipientAddress,
    invoiceNo: p.invoiceNo,
    invoiceDateText: longDateDe(p.invoiceDate),
    dueDateText: longDateDe(p.dueDate),
    ourRef: profile.contactName || p.trainerName,
    monthTitle: monthTitleDe(p.month),
    rows: priced.lines.map((l) => ({
      dateText: longDateDe(l.date),
      service: [l.serviceName, l.label].filter((x) => !!x).join(' '),
      quantityText: quantityText(l.quantity, l.unit),
      rateText: chfText(l.rate),
      amountText: chfText(l.amount),
    })),
    subtotalText: chfText(priced.subtotal),
    totalText: chfText(priced.total),
    bankName: p.bankName ?? '',
    iban: p.iban,
    ibanText: ibanText(p.iban),
    closingText: profile.closingText ?? '',
    amount: (priced.total / 100).toFixed(2),
    qrMessage: `Rechnung ${p.invoiceNo}`,
  };
  if (registered) {
    const rate = p.vatRatePercent;
    payload['vatLine'] = {
      label: rate === undefined ? 'MWST' : `MWST ${rate} %`,
      amountText: chfText(priced.vatAmount),
      vatNumber: profile.vatNumber ?? '',
    };
  } else {
    payload['vatNote'] = profile.vatNote || DEFAULT_VAT_NOTE;
  }
  return payload;
}
