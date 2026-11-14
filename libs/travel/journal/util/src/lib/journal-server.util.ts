import {
  FOOTPRINT_PAGE_TYPE, JournalChange, JournalEntity, JournalImageModel, JournalModel, PageModel, SectionModel,
} from '@okr/shared-models';
import { parseParentKey, reactionKey as emojiReactionKey } from './journal-feedback.util';
import { isValidHlc, parseHlc } from './journal-hlc.util';
import { entityStateKey, JournalState, viewOf } from './journal-merge.util';
import { sectionModelOf } from './journal-section.util';
import { TrackCopy, trackOf } from './journal-track.util';
import { SectionView, sectionViewOf, transportOf, weatherOf } from './journal-view.util';

/**
 * What the applyJournalChange function writes to Firestore, built from the merged change log (spec
 * 1.113 §5.3). Pure, so the server and the tests share it with the device merge. `undefined` means
 * «not created yet or archived»; the function then writes `isArchived: true` and never deletes.
 *
 * A section record becomes the CMS section itself (spec 1.154 phase 2, `SectionDoc`); a record without a known `type`
 * (an old block) gives no doc (decision 4).
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
 * A section as `journals/{jk}/sections/{key}`: the CMS `SectionModel` of `sectionModelOf` (type defaults overlaid
 * with the record; image references keep the journal image key in `label`, `url` stays empty — the file is in the
 * private bucket and is read through signed URLs) plus the journal fields. A conflict copy additionally names the
 * section it was split from and whether the conflict is open — `conflict: false` once the original is deleted:
 * the copy is then a normal section (spec 1.126 §6.3).
 */
export type SectionDoc = SectionModel & {
  journalKey: string; footprintKey: string; authorKey: string; order: string; conflictOf?: string; conflict?: boolean;
};

function sectionDocFrom(section: SectionView, footprintKey: string, journalKey: string, tenants: string[]): SectionDoc {
  const copy = section.conflictOf !== undefined;
  return defined({
    ...sectionModelOf(section, tenants[0] ?? ''), tenants, isArchived: false,
    journalKey, footprintKey, authorKey: section.authorKey, order: section.order,
    conflictOf: section.conflictOf, conflict: copy ? section.conflict : undefined,
  });
}

/** The doc of a section, `undefined` while it is archived or without a known `type` (an old block, decision 4). */
export function sectionDocOf(state: JournalState, sectionKey: string, journalKey: string, tenants: string[]): SectionDoc | undefined {
  const { entityState, view: v } = view(state, 'section', sectionKey);
  const section = sectionViewOf(entityState);
  if (!v || !section) return undefined;
  return sectionDocFrom(section, str(v['footprintKey']), journalKey, tenants);
}

/** The doc of a derived conflict copy (a `sectionsOf` entry with `conflictOf`): the lost values, `conflictOf` and `conflict` set. */
export function conflictCopyDocOf(section: SectionView, footprintKey: string, journalKey: string, tenants: string[]): SectionDoc {
  return sectionDocFrom(section, footprintKey, journalKey, tenants);
}

/** A journal track as `journals/{jk}/tracks/{key}` (plan phase 5 decision 1): the allow-listed copy plus its owner. */
export type TrackDoc = TrackCopy & { okey: string; tenants: string[]; isArchived: false; journalKey: string; authorKey: string };

/**
 * The doc of a `track` entity, `undefined` before its create or once archived. Only the copy's allow-list
 * (`trackCopyFrom`) is written: a record carrying more (heart rate, steps, strokes, crew, notes) loses it here, so
 * neither the stored doc nor the guest payload built from it can carry it. `journalKey` is the trusted argument.
 */
export function trackDocOf(state: JournalState, trackKey: string, journalKey: string, tenants: string[]): TrackDoc | undefined {
  const track = trackOf(state, trackKey);
  if (!track) return undefined;
  const { key, authorKey, ...copy } = track;
  return { ...copy, okey: key, tenants, isArchived: false, journalKey, authorKey };
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

/**
 * A comment as `journals/{jk}/comments/{key}` (CommentModel shape, plan 7). `parentKey` is the record's `section.<key>` /
 * `image.<key>` (spec 1.154 phase 4); an old comment without one (or with a malformed one) stays on `page.<footprintKey>`.
 */
export function commentDocOf(state: JournalState, commentKey: string, tenants: string[]): Record<string, unknown> | undefined {
  const { entityState, view: v } = view(state, 'comment', commentKey);
  if (!v) return undefined;
  const createdAt = str(v['createdAt']);
  return {
    okey: commentKey, tenants, isArchived: false, index: '', tags: '', attachmentKeys: [],
    authorKey: entityState?.ownerKey ?? '', authorName: str(v['authorName']), creationDateTime: createdAt,
    parentKey: parseParentKey(v['parentKey']) ? str(v['parentKey']) : `page.${str(v['footprintKey'])}`, description: str(v['text']),
  };
}

/**
 * A reaction as `journals/{jk}/reactions/{key}` (ReactionModel shape). An emoji reaction (spec 1.154 phase 4) keeps its
 * doc while switched off: `isArchived` is `!active` (plan decision 1), so re-adding it un-archives the same doc. Its
 * fields must agree with its key (`reactionKey` of parent, owner and emoji), else no doc — as on the device. An old
 * footprint like (`type: 'like'`) keeps its shape; anything else gives no doc.
 */
export function reactionDocOf(state: JournalState, reactionKey: string, tenants: string[]): Record<string, unknown> | undefined {
  const { entityState, view: v } = view(state, 'reaction', reactionKey);
  if (!v) return undefined;
  const personKey = entityState?.ownerKey ?? '';
  if (v['type'] === 'like') {
    return { okey: reactionKey, tenants, isArchived: false, parentKey: `page.${str(v['footprintKey'])}`, personKey, type: 'like', createdAt: str(v['createdAt']) };
  }
  const parent = parseParentKey(v['parentKey']);
  const emoji = str(v['emoji']);
  if (!parent || emoji === '' || emojiReactionKey(parent, personKey, emoji) !== reactionKey) return undefined;
  return { okey: reactionKey, tenants, isArchived: v['active'] !== true, parentKey: str(v['parentKey']), personKey, emoji, createdAt: str(v['createdAt']) };
}

/**
 * The private-bucket path of a photo file. The device stores `journals/<journalKey>/<file>` relative
 * to its Documents directory; the bucket keeps the file name under the tenant's journal folder.
 */
export function storagePath(tenant: string, journalKey: string, relativePath: string): string {
  const file = relativePath.split('/').pop() ?? '';
  return file === '' ? '' : `tenant/${tenant}/journal/${journalKey}/${file}`;
}
