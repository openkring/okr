import { TrainerAgreementModel, WorkEntryModel } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';

import { agreementsOverlap, lastDayOfMonth } from './trainer-billing.util';

/**
 * The trainer's page «Meine Abrechnung» (spec 1.167 §7.2–§7.4): which month it opens on, which agreements count in a
 * month and which entries a send would take. Months are `YYYY-MM`, dates StoreDate `yyyyMMdd`.
 */

/** The day of the month from which the page opens on the current month; before it, the month just ended is billed. */
const BILLING_DAY = 10;

/** `20261105` → `2026-11`. */
export function monthOf(storeDate: string): string {
  return `${storeDate.substring(0, 4)}-${storeDate.substring(4, 6)}`;
}

/** `2026-11` moved by `delta` whole months (`-1` → `2026-10`, `+2` → `2027-01`). */
export function shiftMonth(month: string, delta: number): string {
  return monthOf(addDuration(`${month.replace('-', '')}01`, { months: delta }));
}

/** The month the page opens on: the previous month until the 9th (it is still being billed), then the current one. */
export function defaultMonth(today: string): string {
  const month = monthOf(today);
  return Number(today.substring(6, 8)) < BILLING_DAY ? shiftMonth(month, -1) : month;
}

/** The agreements the trainer may work under in `month`: live, self-employment confirmed (D9), validity touching the month. */
export function agreementsInMonth(agreements: TrainerAgreementModel[], month: string): TrainerAgreementModel[] {
  const span = { validFrom: `${month.replace('-', '')}01`, validTo: lastDayOfMonth(month) };
  return agreements.filter(a =>
    !a.isArchived && a.selfEmployedConfirmed && agreementsOverlap({ validFrom: a.validFrom ?? '', validTo: a.validTo ?? '' }, span));
}

/**
 * The agreement of `books` that a preview or send of `month` uses; with two in one month (a new agreement mid-month)
 * the later start wins. undefined when the books have none in the month.
 */
export function agreementOfMonth(agreements: TrainerAgreementModel[], books: string, month: string): TrainerAgreementModel | undefined {
  return agreementsInMonth(agreements, month)
    .filter(a => a.accountingTenantId === books)
    .sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0];
}

/** The open (not yet invoiced) entries of one agreement — the entries a send takes. */
export function openEntriesOf(entries: WorkEntryModel[], agreementKey: string): WorkEntryModel[] {
  if (!agreementKey) return [];
  return entries.filter(e => e.agreementKey === agreementKey && (e.state ?? 'open') === 'open');
}

/** The date a new entry of `month` proposes: today when it lies in the month, else the first day of the month. */
export function entryDefaultDate(month: string, today: string): string {
  return monthOf(today) === month ? today : `${month.replace('-', '')}01`;
}

/** The confirm text of a send: singular for one entry (no «1 Einsätzen»), plural otherwise. */
export function sendConfirmKey(count: number): 'me_send_confirm_one' | 'me_send_confirm_other' {
  return count === 1 ? 'me_send_confirm_one' : 'me_send_confirm_other';
}
