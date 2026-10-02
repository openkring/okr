import { HttpsError } from 'firebase-functions/v2/https';

export const MAX_ABSTRACT_CHARS = 4000;
export const MAX_SUGGESTED_TAGS = 5;
export const MAX_SUMMARY_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * Validates the contract-documents record behind a documents[] ref before its bytes go to Gemini:
 * documents[].docKey is only a pointer, so the record must belong to THIS contract and tenant, have a
 * storage path and fit the size cap. Returns the storage path; anything else is failed-precondition.
 */
export function checkSummarySource(
  doc: Record<string, unknown> | undefined, contractKey: string, tenantId: string, maxBytes = MAX_SUMMARY_SOURCE_BYTES,
): { fullPath: string; mimeType: string } {
  const fail = (why: string) => new HttpsError('failed-precondition', `summarizeContract: ${why}`);
  if (!doc) throw fail('file missing');
  const tenants = Array.isArray(doc['tenants']) ? (doc['tenants'] as unknown[]) : [];
  if (doc['contractKey'] !== contractKey || !tenantId || !tenants.includes(tenantId)) throw fail('file not in this contract');
  const fullPath = typeof doc['fullPath'] === 'string' ? doc['fullPath'].trim() : '';
  if (!fullPath) throw fail('file has no storage path');
  if (Number(doc['size'] ?? 0) > maxBytes) throw fail('file too large');
  return { fullPath, mimeType: String(doc['mimeType'] || 'application/pdf') };
}

/** Parses and clamps the Gemini JSON reply. Invalid JSON is an internal error, never a partial result. */
export function parseSummaryResponse(text: string | undefined): { abstract: string; suggestedTags: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? '');
  } catch {
    throw new HttpsError('internal', 'summarizeContract: invalid model response');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpsError('internal', 'summarizeContract: invalid model response');
  }
  const { abstract, suggestedTags } = parsed as { abstract?: unknown; suggestedTags?: unknown };
  const tags = Array.isArray(suggestedTags)
    ? suggestedTags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
    : [];
  return {
    abstract: typeof abstract === 'string' ? abstract.slice(0, MAX_ABSTRACT_CHARS) : '',
    suggestedTags: tags.slice(0, MAX_SUGGESTED_TAGS),
  };
}
