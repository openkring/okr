import { logger } from 'firebase-functions/v2';

/**
 * Pure resolvers turning a section's `RagConfig` into what `queryRag` actually sends to
 * Gemini, plus the storage-path helpers the indexer uses. Kept out of `index.ts` so the
 * unit tests can import them without registering the storage triggers (which need a bucket
 * and blow up outside a deployed environment) — same split as `ocr/ocr-path.util.ts`.
 */

// Pinned stable model. gemini-3-flash-preview (preview) is flagged for deprecation; gemini-3.6-flash
// is Google's recommended stable replacement (same one used by the OCR extractor).
export const RAG_MODEL = 'gemini-3.6-flash';

/**
 * Models a section may select via `RagConfig.model`. An allowlist rather than a
 * pass-through: the field is free text in the CMS editor, and a retired or mistyped id
 * turns every question into a hard error for members. Anything not listed falls back to
 * `RAG_MODEL` with a warning — which is what the one live section needs today, since it
 * still names the deprecated `gemini-3-flash-preview`.
 * Add an id here only after verifying it with ListModels (see `ocr/gemini-extract.ts`).
 */
const SUPPORTED_RAG_MODELS = new Set<string>([RAG_MODEL]);

/** Bounds for `RagConfig.maxTokens`. 0/absent means "let the model decide". */
const MIN_OUTPUT_TOKENS = 256;
const MAX_OUTPUT_TOKENS = 8192;

/** Metadata key carrying a document's scope, so `RagConfig.documentScope` can filter on it. */
export const SCOPE_METADATA_KEY = 'scope';

/**
 * Derive the RAG store name from a tenantId. This is the ONLY way a store name is
 * produced — both the storage triggers and the callables go through it, so a tenant's
 * documents can only ever be indexed into, and read from, `{tenantId}-rag`.
 */
export function ragStoreName(tenantId: string): string {
    return `${tenantId}-rag`;
}

/** Extract tenantId from a RAG storage path: tenant/{tenantId}/rag/{fileName} */
export function tenantIdFromPath(objectName: string): string | null {
    // e.g. "tenant/scs/rag/report.pdf"
    const parts = objectName.split('/');
    if (parts.length >= 4 && parts[0] === 'tenant' && parts[2] === 'rag') {
        return parts[1];
    }
    return null;
}

/**
 * The scope a document is indexed under: the folder path between `rag/` and the file name.
 * `tenant/scs/rag/statuten/2026.pdf` → `statuten`; a file uploaded flat into `rag/` has no
 * scope. This is what `RagConfig.documentScope` matches against.
 */
export function scopeFromPath(objectName: string): string {
    const parts = objectName.split('/');
    if (parts.length < 5 || parts[0] !== 'tenant' || parts[2] !== 'rag') return '';
    return parts.slice(3, -1).join('/');
}

/**
 * Resolve the model a section asks for. Unknown/retired ids fall back to the pinned stable
 * model rather than failing the query — see `SUPPORTED_RAG_MODELS`.
 */
export function resolveModel(configured: unknown): string {
    if (typeof configured !== 'string' || configured === '') return RAG_MODEL;
    if (SUPPORTED_RAG_MODELS.has(configured)) return configured;
    logger.warn(`queryRag: unsupported model "${configured}" configured, falling back to ${RAG_MODEL}`);
    return RAG_MODEL;
}

/**
 * Clamp `RagConfig.maxTokens` into a usable range. Returns undefined for absent/0/garbage,
 * which leaves the model's own default in place — a section that never set the field must
 * not suddenly get a cap.
 */
export function resolveMaxOutputTokens(configured: unknown): number | undefined {
    if (typeof configured !== 'number' || !Number.isFinite(configured) || configured <= 0) return undefined;
    return Math.min(Math.max(Math.round(configured), MIN_OUTPUT_TOKENS), MAX_OUTPUT_TOKENS);
}

/**
 * AIP-160 filter restricting retrieval to documents indexed under `documentScope`.
 * Returns undefined when no scope is configured (retrieve from the whole store).
 */
export function scopeMetadataFilter(documentScope: unknown): string | undefined {
    if (typeof documentScope !== 'string') return undefined;
    const scope = documentScope.trim().replace(/^\/+|\/+$/g, '');
    if (scope === '' || scope.includes('"')) return undefined;
    return `${SCOPE_METADATA_KEY} = "${scope}"`;
}

/**
 * Fallback system instruction, used when the section configures no `systemPrompt`.
 * Deliberately tenant-agnostic apart from the name: it must not assert what kind of
 * organisation this is (the previous hardcoded prompt named one specific rowing club and
 * then told the model to reason about sailing clubs), and it must not invite the model to
 * answer beyond the indexed documents.
 */
export function defaultSystemPrompt(tenantName: string): string {
    return (
        `Du bist ein hilfreicher Assistent von ${tenantName}. ` +
        'Beantworte Fragen ausschliesslich auf Deutsch. ' +
        'Stütze deine Antworten ausschliesslich auf die bereitgestellten Dokumente. ' +
        'Wenn die Antwort nicht eindeutig aus den Dokumenten hervorgeht, sage das klar ' +
        'und rate nicht.'
    );
}
