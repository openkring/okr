import { blocksFromClassic, convertsExactly, isSameValue, type ArticleLike } from './article-blocks.util';
import type { ImageConfig } from './image.model';
import type { ArticleBlock } from './section.model';

/**
 * The decisions of the article migration (spec 1.173 §11): which articles get `properties.blocks`, and whether a live
 * document may still be written or undone. Pure; the reading and writing is in scripts/migrate-article-blocks.ts.
 */

/** What the migration reads of a section document. */
export interface MigratableSection extends ArticleLike { journalKey?: string; tenants?: string[] }

/** The only two fields that are written: `properties.blocks` and `properties.cover`. */
export interface ArticleMigrationPatch { blocks: ArticleBlock[]; cover?: ImageConfig }

/** Classic shapes of spec 1.173 §8.1; a button does not change the shape. `cover` = text whose hidden image became the cover. */
export type ArticleShape = 'text' | 'cover' | 'image-top' | 'image-bottom' | 'image-left' | 'image-right' | 'gallery-top' | 'gallery-bottom';

export type ArticleMigration =
  | { action: 'migrate'; shape: ArticleShape; patch: ArticleMigrationPatch }
  | { action: 'leave'; reason: 'journal' | 'has-blocks' | 'not-identical' | 'legacy-image-field' };

/** Why a planned article is not written. */
export type ArticleApplySkip = 'missing' | 'other-tenant' | 'has-blocks' | 'changed-since-trial' | 'patch-differs';

/** Why a migrated article is not undone. `old-fields-changed`: without its blocks it would no longer be the article it was. */
export type ArticleUndoSkip = 'missing' | 'other-tenant' | 'not-migrated' | 'edited' | 'old-fields-changed';

/** Whether an article gets blocks, which ones, or why it stays an old article. Never throws on malformed stored data. */
export function planArticleMigration(section: MigratableSection): ArticleMigration {
  if (section.journalKey) return { action: 'leave', reason: 'journal' };
  if (section.properties !== undefined && !isPlainObject(section.properties)) return { action: 'leave', reason: 'not-identical' };
  const p = propertiesOf(section);
  if (p['blocks'] !== undefined) return { action: 'leave', reason: 'has-blocks' };
  const noImages = !Array.isArray(p['images']) || p['images'].length === 0;
  if (noImages && (p['image'] ?? undefined) !== undefined) return { action: 'leave', reason: 'legacy-image-field' };
  // a cover without blocks is ignored today; next to blocks it would become the picture of the teasers
  if (p['cover'] !== undefined || !convertsExactly(section)) return { action: 'leave', reason: 'not-identical' };
  const patch = withoutUndefined(blocksFromClassic(section)) as ArticleMigrationPatch;
  return isStorable(patch) ? { action: 'migrate', shape: shapeOf(patch), patch } : { action: 'leave', reason: 'not-identical' };
}

/** The section as the migration leaves it: the old fields stay next to the blocks. */
export function withMigrationPatch<T extends MigratableSection>(section: T, patch: ArticleMigrationPatch): T {
  return { ...section, properties: { ...section.properties, ...patch } };
}

/** Why a planned article must not be written now; `undefined` = write. `updateTime` is compared as the plan stores it. */
export function articleApplySkip(
  entry: { updateTime: string; patch: ArticleMigrationPatch }, live: { updateTime: string; section: MigratableSection } | undefined, tenant: string,
): ArticleApplySkip | undefined {
  if (!live) return 'missing';
  if (!live.section.tenants?.includes(tenant)) return 'other-tenant';
  if (propertiesOf(live.section)['blocks'] !== undefined) return 'has-blocks';
  if (live.updateTime !== entry.updateTime) return 'changed-since-trial';
  return isPlanned(live.section, entry.patch) ? undefined : 'patch-differs';
}

/** Why the blocks of a migrated article must not be removed; `undefined` = remove `properties.blocks` and `properties.cover`. */
export function articleUndoSkip(patch: ArticleMigrationPatch, section: MigratableSection | undefined, tenant: string): ArticleUndoSkip | undefined {
  if (!section) return 'missing';
  if (!section.tenants?.includes(tenant)) return 'other-tenant';
  const { blocks, cover, ...rest } = propertiesOf(section);
  if (blocks === undefined) return 'not-migrated';
  if (!isSameValue(blocks, patch.blocks) || !isSameValue(cover, patch.cover)) return 'edited';
  return isPlanned({ ...section, properties: rest }, patch) ? undefined : 'old-fields-changed';
}

function isPlanned(section: MigratableSection, patch: ArticleMigrationPatch): boolean {
  const plan = planArticleMigration(section);
  return plan.action === 'migrate' && isSameValue(plan.patch, patch);
}

function shapeOf({ blocks, cover }: ArticleMigrationPatch): ArticleShape {
  const [first, second] = blocks.filter((b) => b.type !== 'button');
  if (first.type === 'columns') return first.columns[0].blocks[0].type === 'image' ? 'image-left' : 'image-right';
  if (!second) return cover ? 'cover' : 'text';
  if (first.type === 'text') return second.type === 'image' ? 'image-bottom' : 'gallery-bottom';
  return first.type === 'image' ? 'image-top' : 'gallery-top';
}

function propertiesOf(section: MigratableSection): Record<string, unknown> {
  return isPlainObject(section.properties) ? section.properties : {};
}

/** A map, not an instance of a class (a Timestamp, a Date …). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** Firestore rejects undefined, at any depth. */
function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => [key, withoutUndefined(v)]));
}

/** Whether the value is the same after the JSON plan, and Firestore takes it (no undefined, no array inside an array). */
function isStorable(value: unknown, inArray = false): boolean {
  if (Array.isArray(value)) return !inArray && value.every((v) => isStorable(v, true));
  if (isPlainObject(value)) return Object.values(value).every((v) => isStorable(v));
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
