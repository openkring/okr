import { AddressModel } from '@bk2/shared-models';

/** Parse a (possibly Swiss-formatted) amount string into a number, or undefined. */
export function parseSwissAmount(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = String(value).replace(/['''’\s]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Pick the favorite (else first) non-archived address of the given channel. */
export function pickFavoriteByChannel(
  addresses: AddressModel[],
  channel: string,
): AddressModel | undefined {
  const matching = addresses.filter(a => a.addressChannel === channel && !a.isArchived);
  return matching.find(a => a.isFavorite) ?? matching[0];
}

export interface QrPayee {
  name: string; iban: string; street: string; buildingNumber: string;
  zip: string; city: string; country: string;
}
export interface QrSlipParty {
  name: string; address: string; buildingNumber?: string;
  zip: string; city: string; country: string;
}
export interface QrSlipData {
  creditor: QrSlipParty & { account: string };
  currency: 'CHF';
  amount?: number;
  debtor?: QrSlipParty;
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function buildDebtor(payload: Record<string, unknown>): QrSlipParty | undefined {
  const name = `${s(payload['firstName'])} ${s(payload['lastName'])}`.trim();
  const zip = s(payload['zipCode']);
  const city = s(payload['city']);
  if (!name || !zip || !city) return undefined;
  const buildingNumber = s(payload['streetNumber']);
  return {
    name,
    address: s(payload['streetName']),
    ...(buildingNumber ? { buildingNumber } : {}),
    zip, city,
    country: s(payload['countryCode']) || 'CH',
  };
}

/** Build a swissqrbill-shaped Data object from the resolved payee + the payload. */
export function buildQrSlipData(
  payee: QrPayee,
  payload: Record<string, unknown>,
  withAmount: boolean,
): QrSlipData {
  const amount = withAmount ? parseSwissAmount(payload['amount']) : undefined;
  const debtor = buildDebtor(payload);
  return {
    creditor: {
      account: payee.iban.replace(/\s/g, ''),
      name: payee.name,
      address: payee.street,
      ...(payee.buildingNumber ? { buildingNumber: payee.buildingNumber } : {}),
      zip: payee.zip,
      city: payee.city,
      country: payee.country || 'CH',
    },
    currency: 'CHF',
    ...(amount !== undefined ? { amount } : {}),
    ...(debtor ? { debtor } : {}),
  };
}
