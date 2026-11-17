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

/**
 * Drop the query string AND the fragment from a URL. Used on the URL fields Sentry records for
 * fetch/xhr breadcrumbs and http.client spans: a request like the geocoder's `?address=<street>`
 * would otherwise carry a home address into Sentry (spec 1.162).
 */
export function stripUrlQuery(url: string): string {
  if (!url) return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Every absolute URL or path inside a text — up to, not including, its `?` or `#`. The query runs to
 * the next whitespace: fetch does not encode `'`, so stopping at a quote would leak the rest of an
 * address like «Chemin de l'Église».
 */
const URL_WITH_QUERY_RE = /((?:https?:\/\/|\/)[^\s?#]*)[?#]\S*/g;

/** Strip query and fragment from every URL inside a free text (e.g. a span description `GET <url>`). */
export function stripUrlQueriesInText<T extends string | undefined>(text: T): T {
  return (typeof text === 'string' ? text.replace(URL_WITH_QUERY_RE, '$1') : text) as T;
}
