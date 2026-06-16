import { BookingAction } from './booking-action.model';
import { AddressModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

/**
 * Returns every action whose trigger matches the given accounting tenant and
 * whose trigger account number appears among the booking's line account ids.
 */
export function matchActions(
  accountingTenantId: string,
  accountIds: string[],
  actions: BookingAction[],
): BookingAction[] {
  return actions.filter(
    (a) =>
      a.trigger.accountingTenantId === accountingTenantId &&
      accountIds.includes(a.trigger.accountId),
  );
}

export type ReceiptParty =
  | { kind: 'person'; person: PersonModel }
  | { kind: 'org'; org: OrgModel };

/** Swiss-grouped amount string, e.g. 100000 Rappen → "1'000.00". */
function formatChf(rappen: number): string {
  return new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rappen / 100);
}

/** Dynamic fields for the donation-receipt template. The caller merges any staticPayload (e.g. logoUrl). */
export function buildReceiptPayload(
  party: ReceiptParty,
  address: AddressModel,
  amountRappen: number,
  bookingDate: string,   // StoreDate, yyyymmdd
): Record<string, string> {
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
    date: convertDateFormatToString(bookingDate, DateFormat.StoreDate, DateFormat.ViewDate, false),
    amount: formatChf(amountRappen),
  };
}
