import { DiaryWeather, JournalEntity, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import { EntityState, JournalState, viewOf } from './journal-merge.util';
import { sortByOrder } from './journal-order.util';

/**
 * The journal as the UI reads it, built from the merged change log (spec 1.113 §5.2). Field names in
 * the change records are the contract: journal { title, subTitle, startDate, endDate }; footprint
 * { journalKey, title, placeName, date, time, latitude, longitude, publishState }; section
 * { footprintKey, kind, html, imageKeys, order }; image { journalKey, takenAt, latitude, longitude,
 * width, height, path2048, path400, localIdentifier }.
 */
export interface JournalView { key: string; title: string; subTitle: string; startDate: string; endDate: string }

export type BlockKind = 'text' | 'photos';

export interface BlockView {
  key: string;
  kind: BlockKind;
  authorKey: string;
  order: string;
  html?: string; // kind 'text'
  imageKeys?: string[]; // kind 'photos', in pick order — may name images not (yet) received; look them up in imagesOf
}

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
  blocks: BlockView[];
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
    }))
    .sort((a, b) => cmp(a.startDate, b.startDate) || cmp(a.title, b.title));
}

function blocksOf(state: JournalState, footprintKey: string): BlockView[] {
  const blocks = live(state, 'section')
    .filter(({ view }) => view['footprintKey'] === footprintKey)
    .map(({ entity, view }) => {
      const kind: BlockKind = view['kind'] === 'photos' ? 'photos' : 'text';
      const block: BlockView = { key: entity.entityKey, kind, authorKey: entity.ownerKey ?? '', order: str(view['order']) };
      if (kind === 'text') block.html = str(view['html']);
      else block.imageKeys = Array.isArray(view['imageKeys']) ? (view['imageKeys'] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
      return { ...block, okey: block.key };
    });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return sortByOrder(blocks).map(({ okey: _okey, ...block }) => block);
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
      blocks: blocksOf(state, entity.entityKey),
    }))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.time, b.time) || cmp(a.key, b.key));
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
    });
  }
  return images;
}

export function lastBlockOrder(footprint: FootprintView): string | undefined {
  return footprint.blocks.length > 0 ? footprint.blocks[footprint.blocks.length - 1].order : undefined;
}

/**
 * True when any of the footprints holds a block of another author. Deleting such a footprint (or the
 * journal around it) would delete the other person's work with it — spec 1.113 anti-goal «losing an
 * entry» — so the store refuses until only own blocks are left.
 */
export function hasOthersBlocks(footprints: FootprintView[], personKey: string): boolean {
  return footprints.some((fp) => fp.blocks.some((block) => block.authorKey !== personKey));
}
