import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

export interface PositionInput {
  name: string;
  amount: number; // CHF
  accountKey: string;
  description?: string;
}

export interface PostalAddress {
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
}

interface BookingLineInput {
  accountKey: string;
  debitAmount?: { amount: number; currency: 'CHF' };
  creditAmount?: { amount: number; currency: 'CHF' };
}

/** Sum of all positions in Rappen (integer, no float drift). */
export function totalRappen(positions: PositionInput[]): number {
  return positions.reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
}

/** Reasons why a draft cannot be issued. An empty array means it can. */
export function issueBlockers(positions: PositionInput[], receivablesAccountKey: string): string[] {
  const blockers: string[] = [];
  if (positions.length === 0) blockers.push('no-positions');
  if (positions.some((p) => !p.accountKey)) blockers.push('position-without-account');
  if (totalRappen(positions) <= 0) blockers.push('total-not-positive');
  if (!receivablesAccountKey) blockers.push('no-receivables-account');
  return blockers;
}

/** Debit receivables with the total, credit each revenue account once (first-seen order). */
export function invoiceBookingLines(positions: PositionInput[], receivablesAccountKey: string): BookingLineInput[] {
  const credits = new Map<string, number>();
  for (const p of positions) {
    credits.set(p.accountKey, (credits.get(p.accountKey) ?? 0) + Math.round(p.amount * 100));
  }
  return [
    { accountKey: receivablesAccountKey, debitAmount: { amount: totalRappen(positions), currency: 'CHF' } },
    ...[...credits].map(([accountKey, amount]) => ({ accountKey, creditAmount: { amount, currency: 'CHF' as const } })),
  ];
}

const chf = (rappen: number): string => (rappen / 100).toFixed(2);
const viewDate = (d: string): string => convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false);

/** Template/QR-slip payload; keys match the invoice layout and the qr-slip util. */
export function buildInvoicePayload(i: {
  invoiceId: string;
  title: string;
  invoiceDate: string;
  dueDate: string;
  receiver: { name1: string; name2: string; modelType: string };
  positions: PositionInput[];
  address?: PostalAddress;
}): Record<string, unknown> {
  const isPerson = i.receiver.modelType === 'person';
  const firstName = i.receiver.name1;
  const a = i.address;
  return {
    invoiceNumber: i.invoiceId,
    title: i.title,
    date: viewDate(i.invoiceDate),
    dueDate: viewDate(i.dueDate),
    firstName,
    lastName: i.receiver.name2,
    greeting: isPerson && firstName ? `Liebe/r ${firstName}` : 'Guten Tag',
    streetName: a?.streetName ?? '',
    streetNumber: a?.streetNumber ?? '',
    zipCode: a?.zipCode ?? '',
    city: a?.city ?? '',
    countryCode: a?.countryCode ?? 'CH',
    amount: chf(totalRappen(i.positions)),
    positions: i.positions.map((p) => ({ name: p.name, amount: chf(Math.round(p.amount * 100)) })),
    qrMessage: `Rechnung ${i.invoiceId}`,
  };
}
