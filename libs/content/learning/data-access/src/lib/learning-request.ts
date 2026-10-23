import type { DocumentLink } from '@okr/shared-models';

/** saveLearningItem payload; only the fields present are written by the callable. */
export interface SaveLearningItemRequest {
  pageKey: string;
  docKey: string;
  title?: string;
  tags?: string;
  notes?: string;
  links?: DocumentLink[];
  attachmentKeys?: string[];
}

export interface PrepareLearningUploadRequest {
  pageKey: string;
  topic: string;
  fileName: string;
  contentType: string;
  size: number;
}

/** prepareLearningUpload answer. `headers` go onto the PUT verbatim (they are part of the signature). */
export interface LearningUpload {
  docKey: string;
  uploadUrl: string;
  contentType: string;
  maxBytes: number;
  headers: Record<string, string>;
}

/** completeLearningUpload payload: the doc whose PUT has just finished. */
export interface CompleteLearningUploadRequest {
  pageKey: string;
  docKey: string;
}

export interface DeleteLearningItemRequest {
  pageKey: string;
  docKey: string;
}

/** Firestore `in` accepts at most 30 values. */
export const IN_QUERY_LIMIT = 30;

export function chunk<T>(items: readonly T[], size = IN_QUERY_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Drops undefined fields: the callable treats a present key as "write this". */
export function shapeSaveRequest(req: SaveLearningItemRequest): SaveLearningItemRequest {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req)) if (v !== undefined) out[k] = v;
  return out as unknown as SaveLearningItemRequest;
}

/** The upload request as the callable wants it: the file's own name/type/size. */
export function shapeUploadRequest(
  pageKey: string, topic: string, file: { name: string; type: string; size: number },
): PrepareLearningUploadRequest {
  return { pageKey, topic, fileName: file.name, contentType: file.type ?? '', size: file.size };
}

/** The headers of the signed PUT: the server's, plus Content-Type (default: the answer's contentType). */
export function mergeUploadHeaders(
  headers: Record<string, string> | undefined, contentType: string,
): Record<string, string> {
  const out: Record<string, string> = { ...(headers ?? {}) };
  const hasType = Object.keys(out).some(k => k.toLowerCase() === 'content-type');
  if (!hasType && contentType) out['Content-Type'] = contentType;
  return out;
}

/** Joined comment text per document ('document.<key>' parent). Archived comments are skipped. */
export function joinCommentTexts(
  comments: ReadonlyArray<{ parentKey?: string; description?: string; isArchived?: boolean }>,
): Record<string, string> {
  const parts: Record<string, string[]> = {};
  for (const c of comments) {
    if (c.isArchived || !c.parentKey?.startsWith('document.') || !c.description) continue;
    (parts[c.parentKey.slice('document.'.length)] ??= []).push(c.description);
  }
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.join('\n')]));
}

export function sortByTitle<T extends { title?: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'de', { sensitivity: 'base' }));
}

export function publicRoomUrl(projectId: string, pageKey: string, tenantId: string): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/publicApi/public/api/v1/pages/`
    + `${encodeURIComponent(pageKey)}?tenantId=${encodeURIComponent(tenantId)}`;
}

/** ratings/{id}: `<docKey>__<personKey>` (firestore.rules). */
export function ratingId(docKey: string, personKey: string): string {
  return `${docKey}__${personKey}`;
}

/** Exactly the fields the rules whitelist — no okey, no index. */
export function ratingData(tenantId: string, docKey: string, personKey: string, stars: number, now: Date) {
  return {
    tenants: [tenantId],
    parentKey: `document.${docKey}`,
    personKey,
    stars,
    updatedAt: now.toISOString(),
    isArchived: false,
  };
}

/** The steps of a learning upload, injected so the order and the cleanup rule are testable. */
export interface LearningUploadSteps {
  prepare: () => Promise<LearningUpload>;
  put: (prepared: LearningUpload) => Promise<void>;
  complete: (docKey: string) => Promise<unknown>;
  cleanup: (docKey: string) => Promise<unknown>;
}

/**
 * prepare → PUT → complete. A failed or aborted PUT, or a refused completion, removes the
 * half-created document (best effort) and rethrows the original error.
 * @returns the new document key
 */
export async function runLearningUpload(steps: LearningUploadSteps): Promise<string> {
  const prepared = await steps.prepare();
  try {
    await steps.put(prepared);
    await steps.complete(prepared.docKey);
  } catch (error) {
    await steps.cleanup(prepared.docKey).catch(() => undefined);
    throw error;
  }
  return prepared.docKey;
}
