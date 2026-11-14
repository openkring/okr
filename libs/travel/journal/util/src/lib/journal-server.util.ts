import {
  ARTICLE_SECTION_SHAPE, ArticleSection, FOOTPRINT_PAGE_TYPE, IMAGE_CONFIG_SHAPE, JournalChange, JournalEntity, JournalImageModel, JournalModel,
  PageModel,
} from '@okr/shared-models';
import { isValidHlc, parseHlc } from './journal-hlc.util';
import { entityStateKey, JournalState, viewOf } from './journal-merge.util';
import { isJournalSectionType, JournalSectionType, SECTION_PROPERTY_PREFIX, sectionClipKeys, sectionImageKeys } from './journal-section.util';
import { SectionView, transportOf, weatherOf } from './journal-view.util';

/**
 * What the applyJournalChange function writes to Firestore, built from the merged change log (spec
 * 1.113 §5.3). Pure, so the server and the tests share it with the device merge. `undefined` means
 * «not created yet or archived»; the function then writes `isArchived: true` and never deletes.
 *
 * Interim (spec 1.154 phase 2, Task 2 — Task 3 writes the CMS section itself): a section record is still written as
 * the phase-1 article doc. An article keeps its html and photos; an album or a hero becomes an article without html
 * whose `properties.images[]` name the journal images (`label` = image key, `url` stays empty — the file is in the
 * private bucket and is read through signed URLs). A video keeps its caption as html and lists its clips like
 * photos, marked `blockKind: 'video'`. A record without a known `type` (an old block) gives no doc (decision 4).
 */
export const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/** A record counts only with a well-formed clock that is not more than 24 h ahead of its upload. */
export function acceptRecord(change: JournalChange, uploadedAtMs: number): boolean {
  if (!isValidHlc(change.hlc, change.deviceId)) return false;
  return parseHlc(change.hlc).wall <= uploadedAtMs + MAX_FUTURE_MS;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);

function view(state: JournalState, entity: JournalEntity, key: string) {
  const entityState = state[entityStateKey(entity, key)];
  return { entityState, view: viewOf(entityState) };
}

/** Drops undefined values: Firestore rejects them. */
function defined<T extends object>(doc: T): T {
  return Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined)) as T;
}

const optStr = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

export function journalDocOf(state: JournalState, journalKey: string, tenants: string[]): Partial<JournalModel> | undefined {
  const { entityState, view: v } = view(state, 'journal', journalKey);
  if (!v) return undefined;
  // the creator is always an author; «Mitautor hinzufügen» adds the others through the `authorKeys` field
  const authorKeys = [...new Set([entityState?.ownerKey ?? '', ...strings(v['authorKeys'])].filter((k) => k !== ''))];
  return defined({
    okey: journalKey, tenants, isArchived: false,
    title: str(v['title']), subTitle: str(v['subTitle']), startDate: str(v['startDate']), endDate: str(v['endDate']),
    // absent stays absent (dropped by `defined`); only a stored string is written
    coverImageKey: optStr(v['coverImageKey']), coverLabel: optStr(v['coverLabel']), lastPageLabel: optStr(v['lastPageLabel']),
    authors: Array.isArray(v['authors']) ? (v['authors'] as JournalModel['authors']) : undefined,
    guests: Array.isArray(v['guests'])
      ? (v['guests'] as unknown[]).filter((g): g is JournalModel['guests'][number] =>
        typeof g === 'object' && g !== null && typeof (g as { person?: { key?: unknown } }).person?.key === 'string')
      : undefined,
    authorKeys,
  });
}

export function footprintPageOf(state: JournalState, footprintKey: string, tenants: string[]): Partial<PageModel> | undefined {
  const { view: v } = view(state, 'footprint', footprintKey);
  if (!v) return undefined;
  return defined({
    okey: footprintKey, tenants, isArchived: false, type: FOOTPRINT_PAGE_TYPE, isPrivate: true,
    name: footprintKey, title: str(v['title']), journalKey: str(v['journalKey']),
    placeName: str(v['placeName']), date: str(v['date']), time: str(v['time']),
    latitude: num(v['latitude']), longitude: num(v['longitude']),
    publishState: v['publishState'] === 'published' ? 'published' as const : 'draft' as const,
    weather: weatherOf(v['weather']),
    transport: transportOf(v['transport']),
  });
}

/**
 * A section doc; a conflict copy additionally names the block it was split from and whether the conflict
 * is open — `conflict: false` once the original is deleted: the copy is then a normal block (spec 1.126 §6.3).
 */
export type SectionDoc = ArticleSection & { conflictOf?: string; conflict?: boolean; blockKind?: 'video' };

interface SectionParts {
  footprintKey: string; authorKey: string; order: string; type: JournalSectionType; html: string; imageKeys: string[]; conflictOf?: string; conflict?: boolean;
}

function sectionDocFrom(sectionKey: string, journalKey: string, tenants: string[], p: SectionParts): SectionDoc {
  const isPhotos = p.type === 'album' || p.type === 'hero';
  const isVideo = p.type === 'video';
  return defined({
    ...ARTICLE_SECTION_SHAPE, okey: sectionKey, name: sectionKey, title: '', subTitle: '', tenants, isArchived: false,
    journalKey, footprintKey: p.footprintKey, authorKey: p.authorKey, order: p.order, conflictOf: p.conflictOf, conflict: p.conflict,
    blockKind: isVideo ? 'video' as const : undefined,
    content: { ...ARTICLE_SECTION_SHAPE.content, htmlContent: isPhotos ? '' : p.html },
    properties: {
      ...ARTICLE_SECTION_SHAPE.properties,
      images: p.imageKeys.map((key) => ({ ...IMAGE_CONFIG_SHAPE, label: key, url: '', altText: '' })),
    },
  });
}

/** The photos (or a video's clips) a section doc lists. */
function docImageKeys(section: SectionView): string[] {
  return section.type === 'video' ? sectionClipKeys(section) : sectionImageKeys(section);
}

export function sectionDocOf(state: JournalState, sectionKey: string, journalKey: string, tenants: string[]): SectionDoc | undefined {
  const { entityState, view: v } = view(state, 'section', sectionKey);
  const type = v?.['type'];
  if (!v || !isJournalSectionType(type)) return undefined;
  const properties = Object.fromEntries(Object.entries(v).filter(([f]) => f.startsWith(SECTION_PROPERTY_PREFIX)).map(([f, x]) => [f.slice(SECTION_PROPERTY_PREFIX.length), x]));
  const section: SectionView = {
    key: sectionKey, type, title: str(v['title']), htmlContent: str(v['htmlContent']), properties, order: str(v['order']),
    authorKey: entityState?.ownerKey ?? '', hlcs: {}, conflict: false,
  };
  return sectionDocFrom(sectionKey, journalKey, tenants, {
    footprintKey: str(v['footprintKey']), authorKey: section.authorKey, order: section.order,
    type, html: section.htmlContent, imageKeys: docImageKeys(section),
  });
}

/** The doc of a derived conflict copy: the original's section with the lost value, `conflictOf` and `conflict` set. */
export function conflictCopyDocOf(section: SectionView, footprintKey: string, journalKey: string, tenants: string[]): SectionDoc {
  return sectionDocFrom(section.key, journalKey, tenants, {
    footprintKey, authorKey: section.authorKey, order: section.order, type: section.type, html: section.htmlContent,
    imageKeys: docImageKeys(section), conflictOf: section.conflictOf, conflict: section.conflict,
  });
}

const VIDEO_FILE = /^[A-Za-z0-9_-]{1,94}-video\.mp4$/;

/** Stored image fields are author-controlled: every path is built under the trusted `journalKey` argument. */
export function imageDocOf(state: JournalState, imageKey: string, journalKey: string, tenants: string[]): JournalImageModel | undefined {
  const { entityState, view: v } = view(state, 'image', imageKey);
  if (!v) return undefined;
  const tenant = tenants[0] ?? '';
  const videoFile = (str(v['videoPath']).split('/').pop() ?? '');
  return defined({
    okey: imageKey, tenants, isArchived: false, journalKey, authorKey: entityState?.ownerKey ?? '',
    takenAt: typeof v['takenAt'] === 'string' ? v['takenAt'] : undefined,
    latitude: num(v['latitude']), longitude: num(v['longitude']),
    width: num(v['width']) ?? 0, height: num(v['height']) ?? 0,
    path2048: storagePath(tenant, journalKey, str(v['path2048'])),
    path400: storagePath(tenant, journalKey, str(v['path400'])),
    videoPath: VIDEO_FILE.test(videoFile) ? storagePath(tenant, journalKey, videoFile) : undefined,
    durationSec: num(v['durationSec']),
  });
}

/** A comment as `journals/{jk}/comments/{key}` (CommentModel shape, plan 7). */
export function commentDocOf(state: JournalState, commentKey: string, tenants: string[]): Record<string, unknown> | undefined {
  const { entityState, view: v } = view(state, 'comment', commentKey);
  if (!v) return undefined;
  const createdAt = str(v['createdAt']);
  return {
    okey: commentKey, tenants, isArchived: false, index: '', tags: '', attachmentKeys: [],
    authorKey: entityState?.ownerKey ?? '', authorName: str(v['authorName']), creationDateTime: createdAt,
    parentKey: `page.${str(v['footprintKey'])}`, description: str(v['text']),
  };
}

/** A like as `journals/{jk}/reactions/{key}` (ReactionModel shape, plan 7). */
export function reactionDocOf(state: JournalState, reactionKey: string, tenants: string[]): Record<string, unknown> | undefined {
  const { entityState, view: v } = view(state, 'reaction', reactionKey);
  if (!v || v['type'] !== 'like') return undefined;
  return {
    okey: reactionKey, tenants, isArchived: false, parentKey: `page.${str(v['footprintKey'])}`,
    personKey: entityState?.ownerKey ?? '', type: 'like', createdAt: str(v['createdAt']),
  };
}

/**
 * The private-bucket path of a photo file. The device stores `journals/<journalKey>/<file>` relative
 * to its Documents directory; the bucket keeps the file name under the tenant's journal folder.
 */
export function storagePath(tenant: string, journalKey: string, relativePath: string): string {
  const file = relativePath.split('/').pop() ?? '';
  return file === '' ? '' : `tenant/${tenant}/journal/${journalKey}/${file}`;
}
