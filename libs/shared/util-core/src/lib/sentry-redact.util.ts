/**
 * Pure DSG/privacy redaction helpers for Sentry payloads.
 * These are a safety net — the real defence is never capturing PII in the first place.
 */

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // AHV-Nummer  756.XXXX.XXXX.XX
  [/\b756\.\d{4}\.\d{4}\.\d{2}\b/g, '[AHV]'],
  // IBAN (CH/LI and general, allows spaced groups)
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, '[IBAN]'],
  // E-Mail
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
];

/** Replace AHV numbers, IBANs and emails inside an arbitrary string. */
export function redactSensitive(input?: string): string | undefined {
  if (!input) return input;
  return PATTERNS.reduce((s, [re, repl]) => s.replace(re, repl), input);
}

/** Drop the query string from a URL so identifiers in params never enter a breadcrumb. */
export function stripPii(url: string): string {
  if (!url) return url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}
