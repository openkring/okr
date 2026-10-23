import type { LearningConfig, PageModel, SectionModel } from '@okr/shared-models';

/** `PageModel.type` of a learning room (spec 1.115 §5.1). Mirrors LEARNING_PAGE_TYPE in apps/functions/src/learning. */
export const LEARNING_PAGE_TYPE = 'learning';

/** A group room's page key is `<groupKey>_learning`; the server derives the group from it. */
export const LEARNING_ROOM_SUFFIX = '_learning';

/** The page key of a group's learning room. */
export function groupLearningPageKey(groupKey: string): string {
  return `${groupKey}${LEARNING_ROOM_SUFFIX}`;
}

/** The page key of a menu room: `<tenantId>_learning_<slug>`. */
export function menuLearningPageKey(tenantId: string, slug: string): string {
  return `${tenantId}${LEARNING_ROOM_SUFFIX}_${slug}`;
}

/** Lowercase ASCII slug of a room name (umlauts spelled out), at most 40 characters; 'raum' when nothing is left. */
export function learningSlug(name: string): string {
  const slug = (typeof name === 'string' ? name : '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'raum';
}

/** The first slug of `name` whose menu page key is not taken (`slug`, `slug-2`, `slug-3`, …). */
export function uniqueLearningSlug(name: string, tenantId: string, takenPageKeys: readonly string[]): string {
  const taken = new Set(takenPageKeys);
  const base = learningSlug(name);
  let slug = base;
  for (let n = 2; taken.has(menuLearningPageKey(tenantId, slug)); n++) slug = `${base}-${n}`;
  return slug;
}

/** The app URL of a room (members only until published). */
export function learningRoomUrl(pageKey: string): string {
  return `/private/${pageKey}`;
}

/** The app URL of one item of a room. */
export function learningItemUrl(pageKey: string, docKey: string): string {
  return `/private/learning-item/${pageKey}/${docKey}`;
}

/** True for a live learning page of the tenant. Pages read from Firestore may lack fields (legacy docs). */
export function isLearningPage(page: Partial<PageModel> | null | undefined, tenantId?: string): boolean {
  if (!page || page.isArchived === true || page.type !== LEARNING_PAGE_TYPE) return false;
  return tenantId === undefined || (page.tenants ?? []).includes(tenantId);
}

/**
 * The config of the first learning section in page order — the same choice the server makes
 * (pickLearningConfig): the section must belong to the tenant and name a root folder.
 * `sections` are in page order; missing entries are skipped.
 */
export function learningConfigOf(
  sections: readonly (Partial<SectionModel> | null | undefined)[], tenantId: string,
): { sectionKey: string; config: LearningConfig } | undefined {
  for (const s of sections) {
    if (!s || s.type !== LEARNING_PAGE_TYPE || !(s.tenants ?? []).includes(tenantId)) continue;
    const config = s.properties as Partial<LearningConfig> | undefined;
    if (!config || typeof config.folder !== 'string' || config.folder === '') continue;
    return {
      sectionKey: s.okey ?? '',
      config: {
        folder: config.folder,
        topics: config.topics ?? '',
        curators: config.curators ?? [],
        defaultTab: config.defaultTab ?? 'files',
      },
    };
  }
  return undefined;
}

/** What the group view's «Dateien» segment shows. */
export type GroupFilesSegment = 'pending' | 'learning' | 'documents';

/**
 * Decides the «Dateien» segment of a group (spec 1.115 §5.1): the group's learning room when
 * `pages/<groupKey>_learning` exists, is not archived and is a learning page of the tenant;
 * otherwise today's document list. `page === undefined` means «still loading»; `null` means
 * «no such page» (or not readable).
 */
export function groupFilesSegment(
  page: Partial<PageModel> | null | undefined, groupKey: string, tenantId: string,
): GroupFilesSegment {
  if (page === undefined) return 'pending';
  if (page === null || !groupKey) return 'documents';
  if (page.okey !== undefined && page.okey !== groupLearningPageKey(groupKey)) return 'documents';
  return isLearningPage(page, tenantId) ? 'learning' : 'documents';
}
