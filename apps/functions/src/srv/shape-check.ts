// Passive half of the Regasoft API watch (spec 1.133 §4.7): every response the sync reads is
// checked against the field names we expect. Kept free of imports from the adapters (they call
// it from `map`), and re-exported by api-watch.ts. Names only — never a field value.
import * as logger from 'firebase-functions/logger';
import { reportToSentry } from './sentry';

const reported = new Set<string>();

/** Test hook: forget what this instance already reported. */
export function resetShapeCheck(): void {
  reported.clear();
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The records inside a response: a bare array / object, or the `{ data }` envelope around one. */
function recordsOf(kind: 'list' | 'detail', raw: unknown): Record<string, unknown>[] {
  const inner = isRecord(raw) && 'data' in raw ? raw['data'] : raw;
  if (kind === 'list') return Array.isArray(inner) ? inner.filter(isRecord) : [];
  return isRecord(inner) ? [inner] : [];
}

/**
 * Compare the field names of a list / detail response with the expected ones. A name nobody
 * expects, or an expected name that no record carries, is logged and reported to Sentry — once per
 * instance and kind, so a changed API does not flood Sentry on every sync. Never throws.
 */
export function checkShape(kind: 'list' | 'detail', raw: unknown, expected: readonly string[]): void {
  try {
    const records = recordsOf(kind, raw);
    if (records.length === 0 || reported.has(kind)) return;
    const seen = new Set<string>();
    for (const r of records) Object.keys(r).forEach(k => seen.add(k));
    const known = new Set(expected);
    const unknown = [...seen].filter(k => !known.has(k)).sort();
    const missing = expected.filter(k => !seen.has(k)).sort();
    if (unknown.length === 0 && missing.length === 0) return;
    reported.add(kind);
    logger.warn(`Regasoft ${kind} response shape changed`, { unknown, missing });
    void reportToSentry({ message: 'Regasoft response shape changed', tags: { kind }, extra: { unknown, missing } });
  } catch (e: unknown) {
    logger.debug('checkShape failed', { error: String(e) });
  }
}
