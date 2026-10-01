/**
 * Swiss QR-bill payment references (spec 1.2). QRR = 26 digits + recursive mod-10 check digit
 * (identical to the legacy ESR reference); it must be paired with a QR-IBAN on the slip.
 * SCOR (ISO 11649) is a planned second `type`.
 */

const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

/** A CH/LI IBAN whose institution id (chars 4–8) lies in the QR-IID range 30000–31999. */
export function isQrIban(iban: string | undefined): boolean {
  const n = (iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^(CH|LI)\d{19}$/.test(n)) return false;
  const iid = Number(n.substring(4, 9));
  return iid >= 30000 && iid <= 31999;
}

/** Recursive mod-10 check digit over a digit string. */
export function qrrCheckDigit(digits: string): number {
  let carry = 0;
  for (const d of digits) carry = MOD10_TABLE[(carry + Number(d)) % 10];
  return (10 - carry) % 10;
}

/** The 27-digit QRR for a numeric base of at most 26 digits (e.g. an invoiceNo). */
export function generateQrReference(base: number | string, type: 'qrr' = 'qrr'): string {
  const digits = String(base);
  if (type !== 'qrr' || !/^\d{1,26}$/.test(digits)) throw new Error(`generateQrReference: invalid base '${digits}'`);
  const padded = digits.padStart(26, '0');
  return padded + qrrCheckDigit(padded);
}

export function normalizeQrReference(ref: string | undefined): string {
  return (ref ?? '').replace(/\s/g, '');
}

export function isValidQrReference(ref: string | undefined): boolean {
  const n = normalizeQrReference(ref);
  return /^\d{27}$/.test(n) && qrrCheckDigit(n.substring(0, 26)) === Number(n[26]);
}

/** `21 00000 00003 13947 14300 09017` — for display only, never for storage. */
export function formatQrReference(ref: string | undefined): string {
  const n = normalizeQrReference(ref);
  if (!n) return '';
  const head = n.substring(0, n.length % 5);
  const groups = n.substring(head.length).match(/\d{5}/g) ?? [];
  return [head, ...groups].filter(Boolean).join(' ');
}

/**
 * The first valid QRR in free bank text, else ''. Digit-only tokens separated by whitespace (space,
 * newline, nbsp) form a run; from every start token, consecutive tokens are concatenated until they
 * reach 27 digits and accepted only when exactly 27 digits with a valid check digit. This tolerates
 * neighbouring numbers (amount, date) without trying arbitrary 27-digit windows.
 */
export function findQrReference(text: string | undefined): string {
  const tokens = (text ?? '').split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    let acc = '';
    for (let j = i; j < tokens.length && /^\d+$/.test(tokens[j]); j++) {
      acc += tokens[j];
      if (acc.length >= 27) {
        if (acc.length === 27 && isValidQrReference(acc)) return acc;
        break;
      }
    }
  }
  return '';
}
