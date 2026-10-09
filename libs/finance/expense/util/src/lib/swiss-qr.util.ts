import { renderQrSvg } from '@okr/system-alias-util';

import { normalizeIban } from './expense.util';

/**
 * The payee of a reimbursement, as the Swiss Payment Code needs it. Structured address ('S'):
 * the standard (SIX IG QR-bill 2.3) makes name, postal code, town and country mandatory; street
 * and building number are optional.
 */
export interface SwissQrCreditor {
  name: string;
  street: string;
  buildingNumber: string;
  zip: string;
  city: string;
  country: string;
}

export interface SwissQrPayment {
  iban: string;
  creditor: SwissQrCreditor;
  /** in CHF/EUR, not cents; 0 leaves the amount open */
  amount: number;
  currency: string;
  /** unstructured message, shown to the payer ("Spesen: Bootsbenzin") */
  message: string;
}

/** Only these two currencies exist on a QR-bill. */
const QR_CURRENCIES = ['CHF', 'EUR'];

/**
 * Whether the IBAN is a QR-IBAN (institution id 30000–31999). A QR-IBAN demands a QR reference,
 * which a reimbursement never has — so no payment code can be built for it.
 */
export function isQrIban(iban: string): boolean {
  const iid = Number(normalizeIban(iban).substring(4, 9));
  return iid >= 30000 && iid <= 31999;
}

/**
 * Why no payment code can be built, or '' when it can. The UI shows the IBAN either way; the QR
 * code is only offered when a banking app would accept it.
 */
export function swissQrBlocker(payment: SwissQrPayment): '' | 'iban' | 'currency' | 'creditor' {
  const iban = normalizeIban(payment.iban);
  // CH/LI: 2 check digits + 5-digit IID + 12-character account, which may contain letters (UBS: '…2440W')
  if (!/^(CH|LI)\d{7}[A-Z0-9]{12}$/.test(iban) || isQrIban(iban)) return 'iban';
  if (!QR_CURRENCIES.includes(payment.currency)) return 'currency';
  const c = payment.creditor;
  if (!c.name.trim() || !c.zip.trim() || !c.city.trim() || !/^[A-Z]{2}$/.test(c.country)) return 'creditor';
  return '';
}

const cut = (value: string, max: number): string => value.replace(/[\r\n]+/g, ' ').trim().substring(0, max);

/**
 * The Swiss Payment Code payload (SPC 0200, structured address, reference type NON).
 * Throws when `swissQrBlocker` reports a problem — call that first.
 */
export function buildSwissPaymentCode(payment: SwissQrPayment): string {
  const blocker = swissQrBlocker(payment);
  if (blocker) throw new Error(`buildSwissPaymentCode: invalid ${blocker}`);
  const c = payment.creditor;
  const amount = payment.amount > 0 ? payment.amount.toFixed(2) : '';
  return [
    'SPC', '0200', '1',
    normalizeIban(payment.iban),
    'S', cut(c.name, 70), cut(c.street, 70), cut(c.buildingNumber, 16), cut(c.zip, 16), cut(c.city, 35), c.country,
    '', '', '', '', '', '', '',          // ultimate creditor (reserved, must stay empty)
    amount, payment.currency,
    '', '', '', '', '', '', '',          // debtor (left to the payer's banking app)
    'NON', '',                           // no reference
    cut(payment.message, 140),
    'EPD',
  ].join('\r\n');
}

/**
 * The payment code as a self-contained SVG, with the Swiss cross the standard puts in the centre
 * (7 mm on a 46 mm symbol). Error correction M, as the standard demands; the cross covers ~2.3 %
 * of the symbol, well within what level M recovers.
 */
export function renderSwissQrSvg(payload: string): string {
  // the quiet zone keeps the code scannable on a dark (dark-mode) background
  const margin = 4;
  const svg = renderQrSvg(payload, { ecc: 'M', margin });
  const extent = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1] ?? 0);
  const box = (extent - 2 * margin) * 7 / 46;
  const x0 = (extent - box) / 2;
  const u = box / 32;   // the cross is drawn on a 32-unit grid inside its box
  const cross =
    `<rect x="${x0}" y="${x0}" width="${box}" height="${box}" fill="#ffffff"/>` +
    `<rect x="${x0 + 2 * u}" y="${x0 + 2 * u}" width="${28 * u}" height="${28 * u}" fill="#000000"/>` +
    `<rect x="${x0 + 13.5 * u}" y="${x0 + 8 * u}" width="${5 * u}" height="${16 * u}" fill="#ffffff"/>` +
    `<rect x="${x0 + 8 * u}" y="${x0 + 13.5 * u}" width="${16 * u}" height="${5 * u}" fill="#ffffff"/>`;
  return svg.replace('</svg>', `${cross}</svg>`);
}

/** The SVG as a data url, bindable to `<img [src]>` without bypassing the sanitizer. */
export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
