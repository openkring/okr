/**
 * Reduce a pasted email address to the bare address.
 * Handles the display-name form copied from mail clients (`Max Muster <max@muster.ch>`,
 * `"Muster, Max" <max@muster.ch>`) and mailto links (`mailto:max@muster.ch?subject=Hi`).
 * Anything else is returned trimmed but otherwise unchanged, so partial input while typing survives.
 */
export function normalizeEmail(raw: string | undefined | null): string {
  if (!raw) return '';
  let value = raw.trim();
  const bracketed = /<([^<>]*)>/.exec(value);
  if (bracketed) value = bracketed[1].trim();
  if (/^mailto:/i.test(value)) {
    value = value.slice('mailto:'.length).split('?')[0];
    try {
      value = decodeURIComponent(value);
    } catch {
      // malformed %-escape: keep the raw value
    }
    value = value.trim();
  }
  return value;
}

/**
 * Split a recipient list on `,` or `;`, ignoring separators inside quotes or angle brackets
 * (`"Muster, Max" <max@muster.ch>` stays one entry), and normalize each entry.
 */
export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;
  let inBrackets = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '<' && !inQuotes) inBrackets = true;
    else if (ch === '>' && !inQuotes) inBrackets = false;
    if ((ch === ',' || ch === ';') && !inQuotes && !inBrackets) {
      entries.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  entries.push(current);
  return entries.map(normalizeEmail).filter(Boolean);
}

/** True when the input holds a display-name or mailto form that normalizeEmail would strip. */
export function needsEmailNormalization(raw: string | undefined | null): boolean {
  return !!raw && (/<[^<>]*>/.test(raw) || /mailto:/i.test(raw));
}
