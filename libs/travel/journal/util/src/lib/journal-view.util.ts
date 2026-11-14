import { DiaryWeather, JournalEntity, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import { conflictCopyKey, dismissedField, isConflictCopyKey, lostValues, winningHlcs } from './journal-conflict.util';
import { CONFLICT_FIELDS, EntityState, entityStateKey, JournalState, viewOf } from './journal-merge.util';
import { sortByOrder } from './journal-order.util';
import { isJournalSectionType, JournalSectionType, SECTION_CONTENT_FIELDS, SECTION_PROPERTY_PREFIX } from './journal-section.util';

/**
 * The journal as the UI reads it, built from the merged change log (spec 1.113 §5.2). Field names in
 * the change records are the contract: journal { title, subTitle, startDate, endDate, coverImageKey, coverLabel, lastPageLabel }; footprint
 * { journalKey, title, placeName, date, time, latitude, longitude, publishState }; section
 * { footprintKey, type, title, htmlContent, order, p_<property key> … } (journal-section.util); image { journalKey, takenAt, latitude, longitude,
 * width, height, path2048, path400, localIdentifier }.
 */
export interface JournalView {
  key: string; title: string; subTitle: string; startDate: string; endDate: string;
  coverImageKey: string; coverLabel: string; lastPageLabel: string; // '' when absent
}

/**
 * A section of a footprint as the UI reads it (spec 1.154 §2): the record's `p_<key>` fields re-nested into
 * `properties`. `sectionModelOf` turns it into a CMS `SectionModel`.
 */
export interface SectionView {
  key: string;
  type: JournalSectionType;
  title: string;
  htmlContent: string;
  properties: Record<string, unknown>; // only the stored keys; the type's defaults come from sectionModelOf
  order: string;
  authorKey: string;
  hlcs: Record<string, string>; // content field → hlc of the value shown (the `bases` of the next edit)
  conflictOf?: string; // a conflict copy: the key of the section it was split from (spec 1.126 §6.3)
  conflict: boolean; // a live copy and its live original both carry the flag
}

/** A concurrent footprint value that lost and was not dismissed yet (spec 1.126 §6.3). */
export interface LostValueView { field: string; value: unknown; authorKey: string; hlc: string }

export interface ImageView {
  key: string;
  authorKey: string;
  takenAt?: string;
  latitude?: number;
  longitude?: number;
  width: number;
  height: number;
  path2048: string; // relative to the app's Documents directory
  path400: string;
  localIdentifier: string;
  videoPath?: string; // a video clip: the mp4, relative to the Documents directory; path2048/path400 are its poster frame
  durationSec?: number; // a video clip: length in seconds
}

export interface FootprintView {
  key: string;
  journalKey: string;
  title: string;
  placeName: string;
  date: string;
  time: string;
  latitude?: number;
  longitude?: number;
  publishState: 'draft' | 'published';
  weather?: DiaryWeather; // filled once online (spec §6.4, plan 8)
  transport?: TransportMode; // how the travellers got here (flyover)
  sections: SectionView[]; // hero first, then by order, conflict copies included
  hlcs: Record<string, string>; // conflict field → hlc of the value shown
  lostValues: LostValueView[]; // reminders; a `dismissed_<hlc>: true` field hides one
}

/** A stored means of transport, or undefined for an empty or unknown value. */
export function transportOf(value: unknown): TransportMode | undefined {
  return TRANSPORT_MODES.includes(value as TransportMode) ? (value as TransportMode) : undefined;
}

/** A stored weather value, or undefined when the field is missing or malformed. */
export function weatherOf(value: unknown): DiaryWeather | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const w = value as Record<string, unknown>;
  const n = (k: string) => (typeof w[k] === 'number' && Number.isFinite(w[k]) ? (w[k] as number) : undefined);
  const code = n('code');
  if (code === undefined || code < 0) return undefined;
  return { code, min: n('min') ?? 0, max: n('max') ?? 0, precip: n('precip') ?? 0, sunrise: String(w['sunrise'] ?? ''), sunset: String(w['sunset'] ?? '') };
}

/** The weather as one chip: '−3–4 °C, 2 mm' (the diary's format). */
export function weatherLine(weather: DiaryWeather | undefined): string {
  return weather ? `${Math.round(weather.min)}–${Math.round(weather.max)} °C, ${Math.round(weather.precip)} mm` : '';
}

function live(state: JournalState, entity: JournalEntity): { entity: EntityState; view: Record<string, unknown> }[] {
  const out: { entity: EntityState; view: Record<string, unknown> }[] = [];
  for (const candidate of Object.values(state)) {
    if (candidate.entity !== entity) continue;
    const view = viewOf(candidate);
    if (view) out.push({ entity: candidate, view });
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function journalsOf(state: JournalState): JournalView[] {
  return live(state, 'journal')
    .map(({ entity, view }) => ({
      key: entity.entityKey,
      title: str(view['title']),
      subTitle: str(view['subTitle']),
      startDate: str(view['startDate']),
      endDate: str(view['endDate']),
      coverImageKey: str(view['coverImageKey']),
      coverLabel: str(view['coverLabel']),
      lastPageLabel: str(view['lastPageLabel']),
    }))
    .sort((a, b) => cmp(a.startDate, b.startDate) || cmp(a.title, b.title));
}

/** The values of a section as if it were not archived: a copy outlives its original's archive. */
function unarchived(entity: EntityState): EntityState {
  return { ...entity, fields: Object.fromEntries(Object.entries(entity.fields).filter(([field]) => field !== 'archived')) };
}

/** Lays record fields over a section view: `title`, `htmlContent`, `order` and the `p_<key>` properties. */
function withFields(section: SectionView, fields: Record<string, unknown>): SectionView {
  const out: SectionView = { ...section, properties: { ...section.properties } };
  for (const [field, value] of Object.entries(fields)) {
    if (field === 'title' || field === 'htmlContent' || field === 'order') out[field] = str(value);
    else if (field.startsWith(SECTION_PROPERTY_PREFIX)) out.properties[field.slice(SECTION_PROPERTY_PREFIX.length)] = value;
  }
  return out;
}

/**
 * One derived section per losing record of the content fields (SECTION_CONTENT_FIELDS). A copy is the original
 * with every content value that record lost, placed right after it (same order, key tie-break); records written against the copy key (`set`
 * and `archive` only) are laid over it. Settings keys have no copies: last writer wins (plan decision 3).
 */
function copiesOf(state: JournalState, original: SectionView, history: EntityState['history'], originalLive: boolean): SectionView[] {
  // one copy per losing record: a record that changed several content keys loses them together, under one key
  const byRecord = new Map<string, { authorKey: string; fields: Record<string, unknown> }>();
  for (const field of SECTION_CONTENT_FIELDS) {
    for (const lost of lostValues(history?.[field])) {
      const record = byRecord.get(lost.hlc) ?? { authorKey: lost.authorKey, fields: {} };
      record.fields[field] = lost.value;
      byRecord.set(lost.hlc, record);
    }
  }
  const copies: SectionView[] = [];
  for (const [hlc, lost] of byRecord) {
    const key = conflictCopyKey(original.key, hlc);
    const own = state[entityStateKey('section', key)];
    const overlay = own ? viewOf({ ...own, created: true }) : {};
    if (!overlay) continue; // the copy was archived
    const lostHlcs = Object.fromEntries(Object.keys(lost.fields).map((field) => [field, hlc]));
    copies.push({
      ...withFields(withFields(original, lost.fields), overlay), key, authorKey: lost.authorKey, conflictOf: original.key, conflict: originalLive,
      hlcs: { ...original.hlcs, ...lostHlcs, ...(own ? winningHlcs(own) : {}) },
    });
  }
  return copies;
}

function sectionFromView(entity: EntityState, view: Record<string, unknown>): SectionView | undefined {
  const type = view['type'];
  if (!isJournalSectionType(type)) return undefined;
  return withFields(
    { key: entity.entityKey, type, title: '', htmlContent: '', properties: {}, order: '', authorKey: entity.ownerKey ?? '', hlcs: winningHlcs(entity), conflict: false },
    view,
  );
}

/**
 * One section as the device and the server read it, without its conflict copies: the record's values as if it were
 * not archived (the caller checks the archive). `undefined` before the create arrived or without a known `type`.
 */
export function sectionViewOf(entity: EntityState | undefined): SectionView | undefined {
  const view = entity && viewOf(unarchived(entity));
  return entity && view ? sectionFromView(entity, view) : undefined;
}

/**
 * The footprint's sections, including the conflict copies derived from lost values: a hero first, then by
 * `order`. A record without a known `type` — an old block (`kind`) from an older build — is ignored (decision 4).
 */
export function sectionsOf(state: JournalState, footprintKey: string): SectionView[] {
  const sections: SectionView[] = [];
  for (const entity of Object.values(state)) {
    if (entity.entity !== 'section' || isConflictCopyKey(entity.entityKey)) continue;
    const view = viewOf(unarchived(entity));
    if (!view || view['footprintKey'] !== footprintKey) continue;
    const section = sectionFromView(entity, view);
    if (!section) continue;
    const live = viewOf(entity) !== undefined;
    const copies = copiesOf(state, section, entity.history, live);
    if (live) sections.push({ ...section, conflict: copies.length > 0 });
    sections.push(...copies);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const ordered = sortByOrder(sections.map((s) => ({ ...s, okey: s.key }))).map(({ okey: _okey, ...s }) => s);
  return [...ordered.filter((s) => s.type === 'hero'), ...ordered.filter((s) => s.type !== 'hero')];
}

/** The footprint's lost values that nobody dismissed, field by field in CONFLICT_FIELDS order. */
function lostValuesOf(entity: EntityState, view: Record<string, unknown>): LostValueView[] {
  return (CONFLICT_FIELDS.footprint ?? []).flatMap((field) => lostValues(entity.history?.[field])
    .filter((lost) => view[dismissedField(lost.hlc)] !== true)
    .map(({ value, authorKey, hlc }) => ({ field, value, authorKey, hlc })));
}

export function footprintsOf(state: JournalState, journalKey: string): FootprintView[] {
  return live(state, 'footprint')
    .filter(({ view }) => view['journalKey'] === journalKey)
    .map(({ entity, view }) => ({
      key: entity.entityKey,
      journalKey,
      title: str(view['title']),
      placeName: str(view['placeName']),
      date: str(view['date']),
      time: str(view['time']),
      latitude: num(view['latitude']),
      longitude: num(view['longitude']),
      publishState: view['publishState'] === 'published' ? ('published' as const) : ('draft' as const),
      weather: weatherOf(view['weather']),
      transport: transportOf(view['transport']),
      sections: sectionsOf(state, entity.entityKey),
      hlcs: winningHlcs(entity),
      lostValues: lostValuesOf(entity, view),
    }))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.time, b.time) || cmp(a.key, b.key));
}

/**
 * The published footprints as they are shown outside the editing app — the guest view, the guest digest
 * and the printed book: no open conflict copies and no conflict reminders, those are for the authors to
 * resolve (spec 1.126 §6.3). A copy whose original is deleted is no longer a conflict: it is a normal section.
 */
export function publishedFootprintsOf(state: JournalState, journalKey: string): FootprintView[] {
  return footprintsOf(state, journalKey)
    .filter((f) => f.publishState === 'published')
    .map((f) => ({
      ...f,
      lostValues: [],
      sections: f.sections.filter((s) => s.conflictOf === undefined || s.conflict === false).map((s) => ({ ...s, conflict: false })),
    }));
}

export function imagesOf(state: JournalState, journalKey: string): Map<string, ImageView> {
  const images = new Map<string, ImageView>();
  for (const { entity, view } of live(state, 'image')) {
    if (view['journalKey'] !== journalKey) continue;
    images.set(entity.entityKey, {
      key: entity.entityKey,
      authorKey: entity.ownerKey ?? '',
      takenAt: typeof view['takenAt'] === 'string' ? view['takenAt'] : undefined,
      latitude: num(view['latitude']),
      longitude: num(view['longitude']),
      width: num(view['width']) ?? 0,
      height: num(view['height']) ?? 0,
      path2048: str(view['path2048']),
      path400: str(view['path400']),
      localIdentifier: str(view['localIdentifier']),
      videoPath: str(view['videoPath']) || undefined,
      durationSec: num(view['durationSec']),
    });
  }
  return images;
}

/** The order of the last section, to append a new one after it. */
export function lastSectionOrder(footprint: FootprintView): string | undefined {
  return footprint.sections.length > 0 ? footprint.sections[footprint.sections.length - 1].order : undefined;
}

/**
 * True when any of the footprints holds a section of another author. Deleting such a footprint (or the
 * journal around it) would delete the other person's work with it — spec 1.113 anti-goal «losing an
 * entry» — so the store refuses until only own sections are left.
 */
export function hasOthersSections(footprints: FootprintView[], personKey: string): boolean {
  return footprints.some((fp) => fp.sections.some((section) => section.authorKey !== personKey));
}
