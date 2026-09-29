import { BookingAction } from './booking-action.model';
import { AddressModel, AvatarInfo, BookingLineModel, BookingModel, OrgModel, PersonModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/**
 * Returns every action whose trigger matches the given accounting tenant and
 * at least one of whose trigger account numbers appears among the booking's line account ids.
 */
export function matchActions(
  accountingTenantId: string,
  accountIds: string[],
  actions: BookingAction[],
): BookingAction[] {
  return actions.filter(
    (a) =>
      a.trigger.accountingTenantId === accountingTenantId &&
      a.trigger.accountIds.some((id) => accountIds.includes(id)),
  );
}

export type ReceiptParty =
  | { kind: 'person'; person: PersonModel }
  | { kind: 'org'; org: OrgModel };

/** Swiss-grouped amount string, e.g. 100000 Rappen → "1'000.00". */
export function formatChf(rappen: number): string {
  return new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rappen / 100);
}

/** One receipt row: the net amount a booking put on one trigger account. */
export interface ReceiptPayment {
  date: string;          // StoreDate, yyyymmdd
  accountId: string;     // trigger account number, e.g. '3407'
  amountRappen: number;  // net credit (credit − debit) on that account, > 0
}

function sameParty(a: AvatarInfo | undefined, b: AvatarInfo): boolean {
  return !!a && a.key === b.key && a.modelType === b.modelType;
}

/**
 * Every payment of `counterparty` in calendar year `year` onto one of `accountIds`, oldest first.
 * Only posted bookings count, plus `alwaysIncludeKey` (the booking the action was started from)
 * unless it is cancelled. A booking touching several trigger accounts (fee + donation in one
 * transfer) yields one row per account; rows netting to ≤ 0 (refunds) are dropped.
 */
export function collectReceiptPayments(
  counterparty: AvatarInfo,
  year: number,
  accountIds: string[],
  bookings: BookingModel[],
  linesByBooking: Map<string, BookingLineModel[]>,
  accountIdByKey: Map<string, string>,
  alwaysIncludeKey = '',
): ReceiptPayment[] {
  const prefix = String(year);
  const payments: ReceiptPayment[] = [];
  for (const b of bookings) {
    if (!sameParty(b.counterparty, counterparty)) continue;
    if (!(b.date ?? '').startsWith(prefix)) continue;
    const counts = b.status === 'posted' || (b.okey === alwaysIncludeKey && b.status !== 'cancelled');
    if (!counts) continue;
    const netByAccount = new Map<string, number>();
    for (const l of linesByBooking.get(b.okey) ?? []) {
      const id = accountIdByKey.get(l.accountKey);
      if (!id || !accountIds.includes(id)) continue;
      const net = (l.creditAmount?.amount ?? 0) - (l.debitAmount?.amount ?? 0);
      netByAccount.set(id, (netByAccount.get(id) ?? 0) + net);
    }
    for (const [accountId, amountRappen] of netByAccount) {
      if (amountRappen > 0) payments.push({ date: b.date, accountId, amountRappen });
    }
  }
  return payments.sort((a, b) => a.date.localeCompare(b.date) || a.accountId.localeCompare(b.accountId));
}

function toViewDate(storeDate: string): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

/** Salutation and postal address of the receipt's recipient (person or org). */
export function buildRecipientPayload(party: ReceiptParty, address: AddressModel): Record<string, string> {
  const isPerson = party.kind === 'person';
  const firstName = isPerson ? party.person.firstName : '';
  const lastName = isPerson ? party.person.lastName : party.org.name;
  const greeting = isPerson
    ? (party.person.gender === 'female' ? 'Liebe ' : 'Lieber ') + party.person.firstName
    : 'Sehr geehrte Damen und Herren';

  return {
    greeting,
    firstName,
    lastName,
    streetName: address.streetName,
    streetNumber: address.streetNumber,
    zipCode: address.zipCode,
    city: address.city,
  };
}

/**
 * Dynamic fields for the donation-receipt template. The caller merges any staticPayload (e.g. logoUrl).
 * `payments` is the per-row list for the template's table; `date`/`amount` (last date, total) are kept
 * for templates that still show a single payment.
 */
export function buildReceiptPayload(
  party: ReceiptParty,
  address: AddressModel,
  payments: ReceiptPayment[],
  year: number,
  labelOf: (accountId: string) => string,
): Record<string, unknown> {
  const total = payments.reduce((sum, p) => sum + p.amountRappen, 0);
  return {
    ...buildRecipientPayload(party, address),
    year: String(year),
    payments: payments.map((p) => ({
      date: toViewDate(p.date),
      label: labelOf(p.accountId),
      amount: formatChf(p.amountRappen),
    })),
    total: formatChf(total),
    date: payments.length ? toViewDate(payments[payments.length - 1].date) : '',
    amount: formatChf(total),
  };
}
