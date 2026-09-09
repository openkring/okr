import { VcardProperty } from './vcard-import-types';

/**
 * vCard lexer — the inverse of `vcard-generator.ts`. Turns a raw `.vcf` file into
 * one array of `VcardProperty` per `BEGIN:VCARD` block (spec §3.1, §3.2).
 * Pure, dependency-free; no vCard *semantics* (field mapping) happen here.
 */

const NAMES_NOT_UNESCAPED = new Set(['PHOTO', 'LOGO', 'SOUND', 'KEY']);

/** Strip a leading BOM and normalize all line endings to `\n`. */
function normalize(text: string): string {
  let t = text;
  if (t.length > 0 && t.codePointAt(0) === 0xfeff) {
    t = t.slice(1);
  }
  return t.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/**
 * Unfold physical lines into logical lines:
 * - a line starting with a space or tab continues the previous line, dropping that char;
 * - a line following a predecessor that ends with `=` and carries
 *   `ENCODING=QUOTED-PRINTABLE` continues it too (2.1 soft break), dropping the `=`.
 */
function unfold(text: string): string[] {
  const rawLines = text.split('\n');
  const out: string[] = [];
  for (const line of rawLines) {
    if (out.length > 0 && line.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
      out[out.length - 1] += line.slice(1);
      continue;
    }
    if (out.length > 0) {
      const prev = out.at(-1) as string;
      if (prev.endsWith('=') && /ENCODING=QUOTED-PRINTABLE/i.test(prev)) {
        out[out.length - 1] = prev.slice(0, -1) + line;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Collect logical lines between `BEGIN:VCARD` and `END:VCARD`; drop an unterminated
 * block and COUNT it, so the caller can tell the operator that something was skipped
 * instead of silently showing one row fewer (§3.1.6).
 */
function splitBlocks(lines: string[]): { blocks: string[][]; unterminated: number } {
  const blocks: string[][] = [];
  let unterminated = 0;
  let current: string[] | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      // a previous, unterminated block is discarded — but never silently.
      if (current) unterminated += 1;
      current = [];
      continue;
    }
    if (upper === 'END:VCARD') {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current && trimmed.length > 0) {
      current.push(line);
    }
  }
  if (current) unterminated += 1;
  return { blocks, unterminated };
}

/** Index of the first `:` not inside a double-quoted param value, or -1. */
function findUnquotedColon(line: string): number {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ':' && !inQuotes) {
      return i;
    }
  }
  return -1;
}

/** Decode `=XX` quoted-printable hex pairs (with literal chars passed through as their own bytes). */
function decodeQuotedPrintable(raw: string, charset: string): string {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(raw.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of encoder.encode(ch)) bytes.push(b);
    }
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}

/** Parse one logical line into a `VcardProperty`. */
function parseLine(line: string): VcardProperty {
  const colonIdx = findUnquotedColon(line);
  const left = colonIdx >= 0 ? line.slice(0, colonIdx) : line;
  const rawSegment = colonIdx >= 0 ? line.slice(colonIdx + 1) : '';

  const tokens = left.split(';');
  const groupAndName = tokens[0] ?? '';
  const dotIdx = groupAndName.indexOf('.');
  const group = dotIdx >= 0 ? groupAndName.slice(0, dotIdx) : undefined;
  const rawName = dotIdx >= 0 ? groupAndName.slice(dotIdx + 1) : groupAndName;
  const upperName = rawName.toUpperCase();
  const name = upperName === 'X-ABLABEL' ? rawName : upperName;

  const params: Record<string, string[]> = {};
  for (const token of tokens.slice(1)) {
    if (token.length === 0) continue;
    const eqIdx = token.indexOf('=');
    if (eqIdx >= 0) {
      const key = token.slice(0, eqIdx).toUpperCase();
      const values = token
        .slice(eqIdx + 1)
        .split(',')
        .map((v) => v.replace(/^"|"$/g, ''));
      params[key] = [...(params[key] ?? []), ...values];
    } else {
      const value = token.toUpperCase();
      params['TYPE'] = [...(params['TYPE'] ?? []), value];
    }
  }

  const isQuotedPrintable = (params['ENCODING'] ?? []).some((v) => v.toUpperCase().includes('QUOTED-PRINTABLE'));
  const decoded = isQuotedPrintable ? decodeQuotedPrintable(rawSegment, (params['CHARSET']?.[0] ?? 'utf-8').toLowerCase()) : rawSegment;

  const rawValue = decoded;
  const value = NAMES_NOT_UNESCAPED.has(upperName) ? decoded : unescapeVcardValue(decoded);

  return { group, name, params, value, rawValue };
}

/** Split a `.vcf` file into one property list per `BEGIN:VCARD…END:VCARD` block. */
export function lexVcards(text: string): VcardProperty[][] {
  return lexVcardFile(text).blocks;
}

/** What one lexed `.vcf` file yielded: its card blocks plus the count of dropped, unterminated ones. */
export interface LexedVcardFile {
  blocks: VcardProperty[][];
  /** blocks that had a `BEGIN:VCARD` but no `END:VCARD` and were therefore dropped (§3.1.6). */
  unterminated: number;
}

/**
 * Lex a whole `.vcf` file, reporting what was dropped. {@link lexVcards} is the
 * blocks-only shorthand over this.
 */
export function lexVcardFile(text: string): LexedVcardFile {
  const lines = unfold(normalize(text));
  const { blocks, unterminated } = splitBlocks(lines);
  // VERSION carries no import-relevant data; drop it so callers don't need to filter it out.
  return {
    blocks: blocks.map((blockLines) => blockLines.map(parseLine).filter((p) => p.name !== 'VERSION')),
    unterminated,
  };
}

/**
 * Undo `escapeVcardValue` (spec §3.1.3), backslash last: `\n`/`\N` → newline, `\,`/`\;` →
 * the bare character, `\\` → a single backslash. Scanned left to right in one pass so
 * `\\n` (i.e. an escaped backslash followed by a literal `n`) yields `\` + `n` as text,
 * not a newline.
 */
export function unescapeVcardValue(v: string): string {
  let out = '';
  let i = 0;
  while (i < v.length) {
    const ch = v[i];
    if (ch === '\\' && i + 1 < v.length) {
      const next = v[i + 1];
      if (next === 'n' || next === 'N') {
        out += '\n';
        i += 2;
        continue;
      }
      if (next === ',' || next === ';' || next === '\\') {
        out += next;
        i += 2;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Split a structured property value (`N`, `ADR`, `ORG`) on unescaped `;`, unescaping each part. */
export function splitStructured(v: string): string[] {
  const parts: string[] = [];
  let current = '';
  let backslashRun = 0;
  for (const ch of v) {
    if (ch === '\\') {
      current += ch;
      backslashRun += 1;
      continue;
    }
    if (ch === ';' && backslashRun % 2 === 0) {
      parts.push(unescapeVcardValue(current));
      current = '';
      backslashRun = 0;
      continue;
    }
    current += ch;
    backslashRun = 0;
  }
  parts.push(unescapeVcardValue(current));
  return parts;
}
