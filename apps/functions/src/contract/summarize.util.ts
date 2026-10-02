import { HttpsError } from 'firebase-functions/v2/https';

export const MAX_ABSTRACT_CHARS = 4000;
export const MAX_SUGGESTED_TAGS = 5;

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
