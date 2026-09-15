import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** CRLF/CR → LF, then split. Blank lines are kept: the PostFinance layout uses them as separators. */
export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Minimal RFC-4180-style field splitter for one line: quotes, doubled quotes, trimmed fields. */
export function parseCsvLine(line: string, separator = ';'): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      out.push(field.trim()); field = '';
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

/** "1'463.00" → 146300, "-5" → -500, "5852,05" → 585205; undefined when empty or not a number. */
export function parseAmountMinor(value: string): number | undefined {
  const cleaned = (value ?? '').replace(/['\s]/g, '').replace(',', '.');
  if (cleaned.length === 0 || !/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

/** dd.mm.yyyy or dd/mm/yyyy (day/month may be unpadded) → yyyymmdd; undefined for anything else. */
export function parseDdMmYyyy(value: string): string | undefined {
  const v = (value ?? '').trim();
  if (!/^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(v)) return undefined;
  const [d, m, y] = v.split(/[./]/);
  const padded = `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  const result = convertDateFormatToString(padded, DateFormat.ViewDate, DateFormat.StoreDate, false);
  return result.length === 8 ? result : undefined;
}

export function collapseWhitespace(value: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeIban(value: string): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}
