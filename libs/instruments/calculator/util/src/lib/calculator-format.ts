import type Decimal from 'decimal.js';

import { ProgBase } from './calculator.model';

export interface NumberSeparators {
  readonly group: string;
  readonly decimal: string;
}

const separatorCache = new Map<string, NumberSeparators>();

/** Grouping and decimal separator of a locale, read from Intl once per locale. */
export function separatorsFor(locale: string): NumberSeparators {
  let separators = separatorCache.get(locale);
  if (!separators) {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
    separators = {
      group: parts.find(p => p.type === 'group')?.value ?? '',
      decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
    };
    separatorCache.set(locale, separators);
  }
  return separators;
}

/** App language → number locale. The Swiss variants give `1’234.5` instead of `1.234,5`. */
export function localeFor(lang: string): string {
  return ['de', 'fr', 'it'].includes(lang) ? `${lang}-CH` : lang;
}

export function groupDigits(digits: string, separator: string, size = 3): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % size === 0) out += separator;
    out += digits[i];
  }
  return out;
}

/** Formats a plain number text (`-1234.50`, no exponent) with locale separators. */
function formatPlain(text: string, separators: NumberSeparators): string {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const dot = body.indexOf('.');
  const integer = dot < 0 ? body : body.slice(0, dot);
  const fraction = dot < 0 ? null : body.slice(dot + 1);
  return (negative ? '-' : '')
    + groupDigits(integer || '0', separators.group)
    + (fraction === null ? '' : separators.decimal + fraction);
}

export function formatDecimal(value: Decimal, locale: string): string {
  if (value.isZero()) return '0';
  const separators = separatorsFor(locale);
  const rounded = value.toSignificantDigits(16);
  const abs = rounded.abs();
  if (abs.gte('1e16') || abs.lt('1e-9')) {
    const [mantissa, exponent] = rounded.toExponential().split('e');
    return formatPlain(mantissa, separators) + 'e' + exponent.replace('+', '');
  }
  return formatPlain(rounded.toFixed(), separators);
}

/** Formats an entry in progress as typed: a trailing `.`, trailing zeros or an open exponent stay visible. */
export function formatDecimalEntry(entry: string, locale: string): string {
  const [mantissa, exponent] = entry.split('e');
  const plain = mantissa === '' || mantissa === '-' ? mantissa + '0' : mantissa;
  return formatPlain(plain, separatorsFor(locale)) + (exponent === undefined ? '' : 'e' + exponent);
}

/** Clipboard text → entry text (`.` decimal, lowercase `e`), or null when it is not one number. */
export function parsePastedDecimal(text: string): string | null {
  let t = text.trim().replace(/[\s'’_]/g, '');
  const commas = (t.match(/,/g) ?? []).length;
  if (commas === 1 && !t.includes('.')) t = t.replace(',', '.');
  else if (commas > 0) return null;
  t = t.replace(/^\+/, '').toLowerCase().replace('e+', 'e');
  return /^-?\d+(\.\d+)?(e-?\d+)?$/.test(t) ? t : null;
}

const PREFIXES: Record<ProgBase, string> = { 16: '0X', 10: '', 8: '0O', 2: '0B' };
const DIGITS = '0123456789ABCDEF';

/** Clipboard text → programmer entry text in `base`, or null. A `-` is only accepted in DEC. */
export function parsePastedProgrammer(text: string, base: ProgBase): string | null {
  let t = text.trim().replace(/[\s'’_]/g, '').toUpperCase();
  const prefix = PREFIXES[base];
  if (prefix && t.startsWith(prefix)) t = t.slice(prefix.length);
  const negative = base === 10 && t.startsWith('-');
  const body = negative ? t.slice(1) : t;
  if (!body || [...body].some(ch => { const i = DIGITS.indexOf(ch); return i < 0 || i >= base; })) return null;
  return (negative ? '-' : '') + body;
}

/** Display font size in rem: full size up to `fits` characters, then shrink down to `min`. */
export function fitFontSize(length: number, max = 3.2, min = 1.2, fits = 12): number {
  return length <= fits ? max : Math.max(min, (max * fits) / length);
}
