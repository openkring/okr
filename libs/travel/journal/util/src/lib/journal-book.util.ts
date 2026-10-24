import { BookPageOverride, BookTemplate, JournalBookModel, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getDayDiff } from '@okr/shared-util-core';
import { albumPages, autoLayout, Box, DPI_OK, DPI_POOR, effectiveDpi, GAP, MARGIN, PAGE_H, PAGE_W, templateBoxes } from './journal-book-layout.util';
import { flyoverInputOf, flyoverTimeline } from './journal-flyover.util';
import { commentsOf, likesOf } from './journal-guest.util';
import { routeLengthKm } from './journal-map.util';
import { JournalState } from './journal-merge.util';
import { BlockView, FootprintView, footprintsOf, ImageView, imagesOf, journalsOf, weatherLine } from './journal-view.util';

/**
 * Deep copy of a Firestore write payload without `undefined` values (Firestore rejects them). Plain objects and
 * arrays are recursed into; anything else (strings, numbers, FieldValue sentinels such as deleteField() or
 * arrayUnion(), which are class instances) is passed through untouched.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as T;
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// The book (design 2026-10-24 «Book structure» 1–7): one pure layout, rendered by the browser preview and the PDF
// function alike. All frames are millimetres in the trim box (origin top-left of the 297 × 210 page); `full` photo
// frames and the overview map reach into the bleed (negative x/y).
//
// Text frames carry HTML. Besides the author's own block HTML, the util emits these classes, which both renderers
// must style: `book-number` (footprint number in the title), `book-author` (author / guest name line),
// `book-likes` («♥ 12»), `book-heading` (heading inside a text frame).

export type TextStyle = 'title' | 'facts' | 'body' | 'author' | 'comment' | 'stats';
export type BookFrame =
  | { kind: 'photo'; box: Box; imageKey: string; fit: 'fill' | 'whole' }
  | { kind: 'text'; box: Box; html: string; style: TextStyle; rotate?: 90 } // rotate: spine title only (cover)
  | { kind: 'map'; box: Box; file: string }; // 'book-map-<name>.jpg'
export type PageRole = 'title' | 'overview' | 'opening' | 'hero' | 'text' | 'photos' | 'comments' | 'stats' | 'blank';
export interface BookPage { role: PageRole; footprintKey?: string; blockKey?: string; template?: BookTemplate; frames: BookFrame[] }
export interface BookWarning { pageIndex: number; imageKey: string; level: 'poor' | 'veryPoor' | 'missing'; dpi?: number }
/** kmByTransport is keyed by TransportMode, stretches without transport under 'none'. extremeLat is signed. */
export interface BookStats { days: number; footprints: number; km: number; kmByTransport: Record<string, number>; photos: number; extremeLat?: number }
/** Splits html into one chunk per page: the first chunk must fit `first`, every further one `next`. */
export type PaginateText = (html: string, style: TextStyle, first: Box, next: Box) => string[];

/** Every printed word of the book, resolved by the caller (the util has no i18n runtime, ruling R3). */
export interface BookLabels {
  day: string; // 'Tag' → «Tag 3»
  stretch: string; // 'Etappe' → «Etappe: 412 km»
  cumulative: string; // 'Gesamt' → «Gesamt: 1234 km»
  km: string; // 'km'
  photos: string; // 'Fotos' → «12 Fotos», and the stats line
  weather: string; // 'Wetter'
  transportVia: string; // 'Unterwegs mit'
  noTransport: string; // 'ohne Angabe'
  transport: Record<TransportMode, string>;
  north: string; // compass letters for coordinates: 'N', 'S', 'O', 'W'
  south: string;
  east: string;
  west: string;
  comments: string; // heading of a comments page
  statsTitle: string; // heading of the closing statistics page
  days: string;
  footprints: string;
  totalKm: string;
  southernmost: string; // extreme latitude, south of the equator
  northernmost: string;
  page: string; // 'Seite' — for the renderers' page captions; layoutBook prints no page numbers
  credit: string; // imagery credit line (overview page and closing page)
  colophon: string; // closing line on the statistics page, '' = none
}

export interface BookInput {
  state: JournalState;
  journalKey: string;
  book: JournalBookModel;
  labels: BookLabels;
  authorName: (personKey: string) => string;
  paginate: PaginateText;
}
/** title and period are what the title page prints; pass them on to coverLayout. */
export interface BookLayout { pages: BookPage[]; warnings: BookWarning[]; stats: BookStats; mapFiles: string[]; title: string; period: string }

export const MAP_OVERVIEW = 'book-map-overview.jpg';
export const MAP_BACK = 'book-map-back.jpg';
export const mapFileOf = (footprintKey: string): string => `book-map-${footprintKey}.jpg`;

const CONTENT_W = PAGE_W - 2 * MARGIN;
const COL_W = (CONTENT_W - GAP) / 2;
const OPENING = {
  title: { x: MARGIN, y: MARGIN, w: COL_W, h: 22 },
  facts: { x: MARGIN, y: MARGIN + 24, w: COL_W, h: 30 },
  stats: { x: MARGIN, y: MARGIN + 56, w: COL_W, h: 26 },
  body: { x: MARGIN, y: MARGIN + 84, w: COL_W, h: PAGE_H - 2 * MARGIN - 84 },
  map: { x: MARGIN + COL_W + GAP, y: MARGIN, w: COL_W, h: PAGE_H - 2 * MARGIN },
};
const TEXT_W = 200;
const TEXT_BOX: Box = { x: (PAGE_W - TEXT_W) / 2, y: MARGIN, w: TEXT_W, h: PAGE_H - 2 * MARGIN };
const CREDIT_BOX: Box = { x: MARGIN, y: PAGE_H - MARGIN - 6, w: CONTENT_W, h: 6 };

// ---------------------------------------------------------------------------------------------------------------
// text helpers

// pictographs, regional indicators (flags), skin tones, tag characters, ZWJ, variation selectors, keycap
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]|‍|︎|️|⃣/gu;
const KEEP = new Set(['©', '®', '™']);

/** Removes emoji and pictographs (the print font has none), keeps letters, punctuation, ©, ®, ™, °. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI, (ch) => (KEEP.has(ch) ? ch : '')).replace(/[ \t]{2,}/g, ' ').trim();
}

/** Escapes plain text for an HTML text frame. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const plain = (text: string): string => escapeHtml(stripEmoji(text));
const para = (html: string, cls?: string): string => (cls ? `<p class="${cls}">${html}</p>` : `<p>${html}</p>`);
const isStoreDate = (d: string | undefined): d is string => !!d && /^\d{8}$/.test(d);

/** A StoreDate as d.M.yyyy, '' when invalid. */
export function bookDate(storeDate: string | undefined): string {
  if (!isStoreDate(storeDate)) return '';
  return `${convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.DDMM, false)}.${storeDate.slice(0, 4)}`;
}

/** Degrees and whole minutes with a compass letter: 54° 48′ S. */
export function degMin(value: number, positive: string, negative: string): string {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 60);
  if (min === 60) {
    deg += 1;
    min = 0;
  }
  return `${deg}° ${min}′ ${value < 0 ? negative : positive}`;
}

const text = (box: Box, html: string, style: TextStyle): BookFrame => ({ kind: 'text', box, html, style });

// ---------------------------------------------------------------------------------------------------------------
// stretches and statistics

interface Stretch { km: number; transport?: TransportMode }

/** The stretch that ends at each positioned footprint (the flyover's legs, published footprints only). */
function stretchesOf(footprints: FootprintView[], images: Map<string, ImageView>): Map<string, Stretch> {
  const { stops, points } = flyoverInputOf(footprints, images, () => '');
  const out = new Map<string, Stretch>();
  for (const leg of flyoverTimeline(stops, points)?.legs ?? []) {
    // flyover paths are [lng, lat], routeLengthKm wants [lat, lng]
    out.set(leg.to.key, { km: routeLengthKm(leg.path.map(([lng, lat]) => [lat, lng] as [number, number])), transport: leg.transport });
  }
  return out;
}

/** The latitude farthest from the equator, signed. */
function extremeLatOf(footprints: FootprintView[]): number | undefined {
  let best: number | undefined;
  for (const f of footprints) if (f.latitude !== undefined && (best === undefined || Math.abs(f.latitude) > Math.abs(best))) best = f.latitude;
  return best;
}

function statsHtml(stats: BookStats, labels: BookLabels): string {
  const km = escapeHtml(labels.km);
  const lines = [
    para(escapeHtml(labels.statsTitle), 'book-heading'),
    para(`${escapeHtml(labels.days)}: ${stats.days}`),
    para(`${escapeHtml(labels.footprints)}: ${stats.footprints}`),
    para(`${escapeHtml(labels.totalKm)}: ${stats.km} ${km}`),
  ];
  const modes: (TransportMode | 'none')[] = [...TRANSPORT_MODES.filter((m) => m in stats.kmByTransport), ...('none' in stats.kmByTransport ? ['none' as const] : [])];
  if (modes.length > 0) {
    lines.push(para(escapeHtml(labels.transportVia), 'book-heading'));
    for (const m of modes) {
      const name = m === 'none' ? labels.noTransport : labels.transport[m];
      lines.push(para(`${escapeHtml(name)}: ${stats.kmByTransport[m]} ${km}`));
    }
  }
  lines.push(para(`${escapeHtml(labels.photos)}: ${stats.photos}`));
  if (stats.extremeLat !== undefined) {
    const label = stats.extremeLat < 0 ? labels.southernmost : labels.northernmost;
    lines.push(para(`${escapeHtml(label)}: ${degMin(stats.extremeLat, labels.north, labels.south)}`));
  }
  return lines.join('');
}

// ---------------------------------------------------------------------------------------------------------------
// footprint pages

interface Ctx {
  input: BookInput;
  images: Map<string, ImageView>;
  hidden: Set<string>;
  whole: Set<string>;
  bleed: number;
}

const photoFrame = (ctx: Ctx, box: Box, imageKey: string): BookFrame =>
  ({ kind: 'photo', box, imageKey, fit: ctx.whole.has(imageKey) ? 'whole' : 'fill' });

function photoPage(ctx: Ctx, fpKey: string, blockKey: string, template: BookTemplate, keys: string[]): BookPage {
  const boxes = templateBoxes(template, ctx.bleed);
  return { role: 'photos', footprintKey: fpKey, blockKey, template, frames: keys.map((k, i) => photoFrame(ctx, boxes[i], k)) };
}

/** The photo pages of an album block; photos beyond a hand-set page's slots are laid out automatically after it. */
function albumBlockPages(ctx: Ctx, fpKey: string, block: BlockView, exclude: string | undefined): BookPage[] {
  const imgs = (block.imageKeys ?? []).map((k) => ctx.images.get(k)).filter((i): i is ImageView => i !== undefined && i.key !== exclude);
  const override: BookPageOverride[] | undefined = ctx.input.book.albums?.[block.key]?.pages;
  const pages: BookPage[] = [];
  for (const p of albumPages(imgs, override, ctx.hidden)) {
    const slots = templateBoxes(p.template, ctx.bleed).length;
    pages.push(photoPage(ctx, fpKey, block.key, p.template, p.imageKeys.slice(0, slots)));
    const rest = p.imageKeys.slice(slots).map((k) => ctx.images.get(k)).filter((i): i is ImageView => i !== undefined);
    for (const q of autoLayout(rest)) pages.push(photoPage(ctx, fpKey, block.key, q.template, q.imageKeys));
  }
  return pages;
}

/** A run of consecutive text blocks as one HTML flow; the author's name follows each change of author. */
function runHtml(ctx: Ctx, run: BlockView[]): string {
  let html = '';
  run.forEach((b, i) => {
    html += stripEmoji(b.html ?? '');
    if (run[i + 1]?.authorKey !== b.authorKey) html += para(plain(ctx.input.authorName(b.authorKey)), 'book-author');
  });
  return html;
}

/** Blocks grouped into runs: consecutive text blocks together, each photo block alone; empty texts dropped. */
function runsOf(blocks: BlockView[]): { kind: 'text' | 'photos'; blocks: BlockView[] }[] {
  const runs: { kind: 'text' | 'photos'; blocks: BlockView[] }[] = [];
  for (const b of blocks) {
    if (b.kind === 'text') {
      if (!stripEmoji(b.html ?? '')) continue;
      const last = runs[runs.length - 1];
      if (last?.kind === 'text') last.blocks.push(b);
      else runs.push({ kind: 'text', blocks: [b] });
    } else runs.push({ kind: 'photos', blocks: [b] });
  }
  return runs;
}

function commentPages(ctx: Ctx, fp: FootprintView): BookPage[] {
  const { state, book, labels, paginate } = ctx.input;
  const setting = book.footprints?.[fp.key];
  if (!setting?.showComments) return [];
  const chosen = new Set(setting.commentKeys ?? []);
  const comments = commentsOf(state, fp.key).filter((c) => chosen.has(c.key));
  if (comments.length === 0) return [];
  const likes = likesOf(state, fp.key).length;
  let html = para(escapeHtml(labels.comments), 'book-heading');
  if (likes > 0) html += para(`♥ ${likes}`, 'book-likes');
  for (const c of comments) html += para(plain(c.text)) + para(plain(c.authorName), 'book-author');
  return paginate(html, 'comment', TEXT_BOX, TEXT_BOX)
    .map((chunk): BookPage => ({ role: 'comments', footprintKey: fp.key, frames: [text(TEXT_BOX, chunk, 'comment')] }));
}

interface FootprintFacts { number: number; day?: number; stretch?: Stretch; cumulative: number }

function openingFrames(ctx: Ctx, fp: FootprintView, facts: FootprintFacts, photoCount: number): BookFrame[] {
  const { labels } = ctx.input;
  const km = escapeHtml(labels.km);
  const factLines = [[bookDate(fp.date), fp.time].filter((s) => s).join(', '), plain(fp.placeName)];
  if (fp.latitude !== undefined && fp.longitude !== undefined) {
    factLines.push(`${degMin(fp.latitude, labels.north, labels.south)}, ${degMin(fp.longitude, labels.east, labels.west)}`);
  }
  if (fp.weather) factLines.push(`${escapeHtml(labels.weather)}: ${weatherLine(fp.weather)}`);
  const s = facts.stretch;
  const via = s ? ` · ${escapeHtml(labels.transportVia)} ${escapeHtml(s.transport ? labels.transport[s.transport] : labels.noTransport)}` : '';
  const statLines = [
    facts.day !== undefined ? `${escapeHtml(labels.day)} ${facts.day}` : '',
    `${escapeHtml(labels.stretch)}: ${s ? s.km : '–'} ${km}${via}`,
    `${escapeHtml(labels.cumulative)}: ${facts.cumulative} ${km}`,
    `${photoCount} ${escapeHtml(labels.photos)}`,
  ];
  const lines = (l: string[]) => l.filter((x) => x).map((x) => para(x)).join('');
  return [
    text(OPENING.title, para(`<span class="book-number">${facts.number}</span> ${plain(fp.title)}`), 'title'),
    text(OPENING.facts, lines(factLines), 'facts'),
    text(OPENING.stats, lines(statLines), 'stats'),
  ];
}

/** Opening page, hero, the blocks in their order, comments. */
function footprintPages(ctx: Ctx, fp: FootprintView, facts: FootprintFacts): BookPage[] {
  const firstAlbum = fp.blocks.find((b) => b.kind === 'photos');
  const heroKey = firstAlbum?.imageKeys?.find((k) => ctx.images.has(k) && !ctx.hidden.has(k)); // ruling R4
  const body: BookPage[] = [];
  let openingText: string | undefined;
  runsOf(fp.blocks).forEach((run, i) => {
    if (run.kind === 'photos') {
      body.push(...albumBlockPages(ctx, fp.key, run.blocks[0], heroKey));
      return;
    }
    const chunks = ctx.input.paginate(runHtml(ctx, run.blocks), 'body', i === 0 ? OPENING.body : TEXT_BOX, TEXT_BOX);
    chunks.forEach((chunk, c) => {
      if (i === 0 && c === 0) openingText = chunk; // a leading text starts on the opening page
      else body.push({ role: 'text', footprintKey: fp.key, blockKey: run.blocks[0].key, frames: [text(TEXT_BOX, chunk, 'body')] });
    });
  });
  const hero: BookPage[] = heroKey
    ? [{ role: 'hero', footprintKey: fp.key, blockKey: firstAlbum?.key, template: 'full', frames: [photoFrame(ctx, templateBoxes('full', ctx.bleed)[0], heroKey)] }]
    : [];
  const photoCount = [...hero, ...body].reduce((n, p) => n + p.frames.filter((f) => f.kind === 'photo').length, 0);
  const frames = openingFrames(ctx, fp, facts, photoCount);
  if (openingText !== undefined) frames.push(text(OPENING.body, openingText, 'body'));
  if (facts.stretch) frames.push({ kind: 'map', box: OPENING.map, file: mapFileOf(fp.key) });
  return [{ role: 'opening', footprintKey: fp.key, frames }, ...hero, ...body, ...commentPages(ctx, fp)];
}

// ---------------------------------------------------------------------------------------------------------------
// the book

/** Per photo frame: 'missing' without print photo (dpi from the image's own size), else below 300 / 200 dpi. */
function warningsOf(pages: BookPage[], ctx: Ctx): BookWarning[] {
  const warnings: BookWarning[] = [];
  pages.forEach((page, pageIndex) => {
    for (const f of page.frames) {
      if (f.kind !== 'photo') continue;
      const print = ctx.input.book.prints?.[f.imageKey];
      const own = ctx.images.get(f.imageKey);
      const px = print ?? (own && own.width > 0 && own.height > 0 ? own : undefined);
      const dpi = px ? Math.round(effectiveDpi(px, f.box, f.fit)) : undefined;
      if (!print) warnings.push({ pageIndex, imageKey: f.imageKey, level: 'missing', ...(dpi !== undefined ? { dpi } : {}) });
      else if (dpi !== undefined && dpi < DPI_POOR) warnings.push({ pageIndex, imageKey: f.imageKey, level: 'veryPoor', dpi });
      else if (dpi !== undefined && dpi < DPI_OK) warnings.push({ pageIndex, imageKey: f.imageKey, level: 'poor', dpi });
    }
  });
  return warnings;
}

export function layoutBook(input: BookInput): BookLayout {
  const { state, journalKey, book, labels } = input;
  const journal = journalsOf(state).find((j) => j.key === journalKey);
  const footprints = footprintsOf(state, journalKey).filter((f) => f.publishState === 'published');
  const images = imagesOf(state, journalKey);
  const ctx: Ctx = { input, images, hidden: new Set(book.hiddenImageKeys ?? []), whole: new Set(book.fitWhole ?? []), bleed: book.print?.bleedMm ?? 3 };

  // 2. title page
  const title = stripEmoji(book.title || journal?.title || '');
  const subTitle = stripEmoji(book.subTitle ?? journal?.subTitle ?? '');
  const start = isStoreDate(journal?.startDate) ? journal.startDate : footprints[0]?.date;
  const end = isStoreDate(journal?.endDate) ? journal.endDate : footprints[footprints.length - 1]?.date;
  const period = [bookDate(start), end !== start ? bookDate(end) : ''].filter((s) => s).join(' – ');
  const authorKeys = [...new Set(footprints.flatMap((f) => f.blocks.map((b) => b.authorKey)).filter((k) => k))];
  const authors = authorKeys.map((k) => plain(input.authorName(k))).filter((s) => s).join(' · ');
  const titleFrames: BookFrame[] = [text({ x: MARGIN, y: 60, w: CONTENT_W, h: 30 }, para(escapeHtml(title)), 'title')];
  if (subTitle) titleFrames.push(text({ x: MARGIN, y: 92, w: CONTENT_W, h: 14 }, para(escapeHtml(subTitle)), 'facts'));
  if (period) titleFrames.push(text({ x: MARGIN, y: 108, w: CONTENT_W, h: 10 }, para(period), 'facts'));
  if (authors) titleFrames.push(text({ x: MARGIN, y: 122, w: CONTENT_W, h: 10 }, para(authors), 'author'));
  const pages: BookPage[] = [{ role: 'title', frames: titleFrames }];
  const mapFiles: string[] = [];

  // 3. overview map
  if (footprints.some((f) => f.latitude !== undefined && f.longitude !== undefined)) {
    const frames: BookFrame[] = [{ kind: 'map', box: templateBoxes('full', ctx.bleed)[0], file: MAP_OVERVIEW }];
    if (labels.credit) frames.push(text(CREDIT_BOX, para(escapeHtml(labels.credit)), 'facts'));
    pages.push({ role: 'overview', frames });
    mapFiles.push(MAP_OVERVIEW);
  }

  // 4./5. footprints, numbered 1…n
  const stretches = stretchesOf(footprints, images);
  const kmByTransport: Record<string, number> = {};
  let cumulative = 0;
  footprints.forEach((fp, i) => {
    const stretch = stretches.get(fp.key);
    if (stretch) {
      cumulative += stretch.km;
      const k = stretch.transport ?? 'none';
      kmByTransport[k] = (kmByTransport[k] ?? 0) + stretch.km;
      mapFiles.push(mapFileOf(fp.key));
    }
    const day = isStoreDate(start) && isStoreDate(fp.date) ? getDayDiff(start, fp.date) + 1 : undefined;
    pages.push(...footprintPages(ctx, fp, { number: i + 1, day, stretch, cumulative }));
  });

  // 6. closing statistics
  const printed = new Set(pages.flatMap((p) => p.frames).flatMap((f) => (f.kind === 'photo' ? [f.imageKey] : [])));
  const stats: BookStats = {
    days: isStoreDate(start) && isStoreDate(end) ? getDayDiff(start, end) + 1 : 0,
    footprints: footprints.length,
    km: cumulative,
    kmByTransport,
    photos: printed.size,
    extremeLat: extremeLatOf(footprints),
  };
  const statsFrames: BookFrame[] = [text({ ...TEXT_BOX, h: TEXT_BOX.h - 14 }, statsHtml(stats, labels), 'stats')];
  const closing = [labels.credit, labels.colophon].filter((s) => s).map((s) => para(escapeHtml(s))).join('');
  if (closing) statsFrames.push(text({ ...CREDIT_BOX, y: CREDIT_BOX.y - 6, h: 12 }, closing, 'facts'));
  pages.push({ role: 'stats', frames: statsFrames });

  // 7. padding
  const multiple = Math.max(1, Math.floor(book.print?.pageMultiple ?? 4));
  while (pages.length % multiple !== 0) pages.push({ role: 'blank', frames: [] });
  if (book.print?.cover && book.print.cover !== 'none') mapFiles.push(MAP_BACK);

  return { pages, warnings: warningsOf(pages, ctx), stats, mapFiles, title, period };
}
