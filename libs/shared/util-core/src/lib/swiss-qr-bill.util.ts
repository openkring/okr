/**
 * The Swiss QR-bill payload (Swiss Payment Code, SIX IG QR-bill 2.x) as found in the QR code of an
 * invoice. Pure functions, shared by the OCR pipeline (which decodes the code from a receipt and
 * stores the payload on `ocr-results.qrBill`) and the app (which renders it again).
 *
 * Line layout (0-based) of version 02xx:
 *   0 'SPC' · 1 version · 2 coding · 3 IBAN
 *   4–10  creditor: address type, name, street/line 1, building/line 2, zip, town, country
 *   11–17 ultimate creditor (reserved, empty)
 *   18 amount · 19 currency
 *   20–26 ultimate DEBTOR: address type, name, street/line 1, building/line 2, zip, town, country
 *   27 reference type (QRR | SCOR | NON) · 28 reference · 29 unstructured message · 30 'EPD'
 *   31+ optional billing information and alternative procedures
 */

const DEBTOR_LINES = [20, 21, 22, 23, 24, 25, 26];

export interface SwissQrBill {
  iban: string;
  creditorName: string;
  /** street + building number (address type S) or the first address line (type K) */
  creditorStreet: string;
  /** zip + town (type S) or the second address line (type K) */
  creditorPlace: string;
  creditorCountry: string;
  /** '' = amount left open */
  amount: string;
  currency: string;
  referenceType: string;
  reference: string;
  message: string;
}

function splitLines(payload: string): string[] {
  return payload.split(/\r?\n/);
}

/** Whether the text is a Swiss Payment Code (first line 'SPC', version 02xx, trailer 'EPD'). */
export function isSwissQrBill(payload: string | undefined): boolean {
  if (!payload) return false;
  const lines = splitLines(payload);
  return lines[0] === 'SPC' && /^02\d\d$/.test(lines[1] ?? '') && lines[30] === 'EPD';
}

/** Parse a Swiss Payment Code; undefined when the text is not one. */
export function parseSwissQrBill(payload: string | undefined): SwissQrBill | undefined {
  if (!payload || !isSwissQrBill(payload)) return undefined;
  const l = splitLines(payload).map(s => s.trim());
  const structured = l[4] === 'S';
  return {
    iban: l[3],
    creditorName: l[5],
    creditorStreet: structured ? `${l[6]} ${l[7]}`.trim() : l[6],
    creditorPlace: structured ? `${l[8]} ${l[9]}`.trim() : l[7],
    creditorCountry: l[10],
    amount: l[18],
    currency: l[19],
    referenceType: l[27],
    reference: l[28],
    message: l[29],
  };
}

/**
 * The payload with the ultimate-debtor block blanked. The debtor of a receipt is the member who
 * paid it — their name and home address. `ocr-results` is tenant-readable, so storing the raw
 * payload would copy a member's address into a collection every member can read. A banking app
 * fills in the payer itself, so the stripped code still pays the same bill. Line separators are
 * normalised to CRLF, as the standard writes them.
 */
export function stripQrBillDebtor(payload: string): string {
  const lines = splitLines(payload);
  for (const i of DEBTOR_LINES) if (i < lines.length) lines[i] = '';
  return lines.join('\r\n');
}
