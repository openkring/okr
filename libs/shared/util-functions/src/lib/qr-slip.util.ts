import { AddressModel } from '@okr/shared-models';
import { isQrIban, normalizeQrReference } from '@okr/shared-util-core';

/** Parse a (possibly Swiss-formatted) amount string into a number, or undefined. */
export function parseSwissAmount(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = String(value).replace(/['‘’\s]/g, ''); // strip ' ‘ ’ + whitespace
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
  name: string; iban: string; qrIban: string; regularIban: string;
  street: string; buildingNumber: string;
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
  reference?: string;
  debtor?: QrSlipParty;
  message?: string;
}

export interface SlipAccount { account: string; reference?: string; }

export class SlipAccountError extends Error {
  constructor(public readonly code: 'qr-iban-needs-reference' | 'no-iban') { super(code); this.name = 'SlipAccountError'; }
}

const cleanIban = (iban: string | undefined): string => (iban ?? '').replace(/\s/g, '');

/** The payee's QR-IBAN and regular IBAN: favorite-else-first non-archived bankaccount address of each kind. */
export function pickBankIbans(addresses: AddressModel[]): { qrIban: string; regularIban: string } {
  const banks = addresses.filter(a => a.addressChannel === 'bankaccount' && !a.isArchived && cleanIban(a.iban));
  const pick = (qr: boolean): string => {
    const kind = banks.filter(a => isQrIban(a.iban) === qr);
    return cleanIban((kind.find(a => a.isFavorite) ?? kind[0])?.iban);
  };
  return { qrIban: pick(true), regularIban: pick(false) };
}

/**
 * QRR must be paired with a QR-IBAN and NON with a regular IBAN (spec 1.2 §3.2), so a reference
 * is only emitted together with a QR-IBAN and the slip cannot be invalid by construction.
 */
export function selectSlipAccount(payee: QrPayee, reference: string): SlipAccount {
  const ref = normalizeQrReference(reference);
  if (ref && payee.qrIban) return { account: payee.qrIban, reference: ref };
  if (payee.regularIban) return { account: payee.regularIban };
  throw new SlipAccountError(payee.qrIban ? 'qr-iban-needs-reference' : 'no-iban');
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
  selected: SlipAccount = { account: payee.iban },
): QrSlipData {
  const amount = withAmount ? parseSwissAmount(payload['amount']) : undefined;
  const debtor = buildDebtor(payload);
  const message = s(payload['qrMessage']).trim().slice(0, 140);
  return {
    creditor: {
      account: cleanIban(selected.account),
      name: payee.name,
      address: payee.street,
      ...(payee.buildingNumber ? { buildingNumber: payee.buildingNumber } : {}),
      zip: payee.zip,
      city: payee.city,
      country: payee.country || 'CH',
    },
    currency: 'CHF',
    ...(amount !== undefined ? { amount } : {}),
    ...(selected.reference ? { reference: selected.reference } : {}),
    ...(debtor ? { debtor } : {}),
    ...(message ? { message } : {}),
  };
}
