import { CalcDomain } from './calculator-domain';

/** `007` → `7`, `-00` → `-0`; hex digits count, the lowercase exponent `e` does not. */
function normaliseLeadingZeros(text: string): string {
  return text.replace(/^(-?)0+(?=[0-9A-F])/, '$1');
}

export function appendDigit<V>(entry: string | null, digit: string, d: CalcDomain<V>): string | null {
  const next = normaliseLeadingZeros((entry ?? '') + digit);
  return d.accepts(next) ? next : entry;
}

export function appendPoint<V>(entry: string | null, d: CalcDomain<V>): string | null {
  if (!d.allowsPoint) return entry;
  const base = entry ?? '0';
  return /[.e]/.test(base) ? base : base + '.';
}

/** Toggles the sign of the mantissa, or of the exponent once an exponent is being typed. */
export function toggleSign(entry: string): string {
  const e = entry.indexOf('e');
  if (e >= 0) {
    const exponent = entry.slice(e + 1);
    return entry.slice(0, e + 1) + (exponent.startsWith('-') ? exponent.slice(1) : '-' + exponent);
  }
  return entry.startsWith('-') ? entry.slice(1) : '-' + entry;
}

export function backspace(entry: string): string {
  const next = entry.slice(0, -1);
  return next === '' || next === '-' ? '0' : next;
}

export function startExponent<V>(entry: string | null, raw: string, d: CalcDomain<V>): string | null {
  if (!d.allowsExponent) return entry;
  const base = entry ?? raw;
  return base.includes('e') ? base : base + 'e';
}
