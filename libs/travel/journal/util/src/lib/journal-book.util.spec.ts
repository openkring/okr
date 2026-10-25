import { describe, expect, it, vi } from 'vitest';
import { JournalBookModel, JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { routeLengthKm } from './journal-map.util';
import { templateBoxes } from './journal-book-layout.util';
import { bookBlockHtml, BookFrame, BookInput, BookLabels, BookPage, bookPrintCandidates, coverImageKeyOf, COVER_PAGE_INDEX, layoutBook, PaginateText, stripEmoji, stripUndefined } from './journal-book.util';
import { localViewDateTime } from './journal-book-i18n';
import { coverLayout } from './journal-book-cover.util';

class Sentinel { constructor(public readonly tag: string) {} }

describe('stripUndefined', () => {
  it('drops undefined values at every depth', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: 'x' }, f: [1, undefined, { g: undefined, h: 2 }] }))
      .toEqual({ a: 1, c: { e: 'x' }, f: [1, { h: 2 }] });
  });
  it('keeps class-instance sentinels as the same instance', () => {
    const s = new Sentinel('delete');
    const out = stripUndefined({ albums: { k: s }, x: undefined });
    expect(out.albums.k).toBe(s);
    expect('x' in out).toBe(false);
  });
  it('keeps null, false, 0 and empty values', () => {
    expect(stripUndefined({ a: null, b: false, c: 0, d: '', e: [] })).toEqual({ a: null, b: false, c: 0, d: '', e: [] });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// layoutBook

let n = 0;
function rec(entity: JournalChange['entity'], entityKey: string, fields: Record<string, unknown>, authorKey = 'bruno'): JournalChange {
  n += 1;
  const deviceId = `dev-${authorKey}`;
  return { id: `r${n}`, journalKey: 'j1', deviceId, seq: n, hlc: formatHlc({ wall: 1000 + n, counter: 0, deviceId }), authorKey, entity, entityKey, op: 'create', fields };
}
const journal = (fields: Record<string, unknown> = {}) => rec('journal', 'j1', { title: 'Antarktis', subTitle: 'Mit dem Schiff', startDate: '20270101', endDate: '20270110', ...fields });
const fp = (key: string, date: string, fields: Record<string, unknown> = {}) =>
  rec('footprint', key, { journalKey: 'j1', title: `Ort ${key}`, placeName: '', date, time: '10:00', publishState: 'published', ...fields });
const text = (key: string, footprintKey: string, order: string, html: string, author = 'bruno') =>
  rec('section', key, { footprintKey, kind: 'text', html, order }, author);
const photos = (key: string, footprintKey: string, order: string, imageKeys: string[]) =>
  rec('section', key, { footprintKey, kind: 'photos', imageKeys, order });
const img = (key: string, width = 4000, height = 3000) =>
  rec('image', key, { journalKey: 'j1', width, height, path2048: `${key}.jpg`, path400: `${key}-400.jpg`, localIdentifier: key });

const LABELS: BookLabels = {
  day: 'Tag', stretch: 'Etappe', cumulative: 'Gesamt', km: 'km', photo: 'Foto', photos: 'Fotos', weather: 'Wetter',
  transportVia: 'Unterwegs mit', noTransport: 'ohne Angabe',
  transport: { plane: 'Flugzeug', ship: 'Schiff', bus: 'Bus', train: 'Zug', car: 'Auto', bike: 'Velo', foot: 'zu Fuss', row: 'Ruderboot', ski: 'Ski', motorbike: 'Motorrad' },
  north: 'N', south: 'S', east: 'O', west: 'W',
  comments: 'Kommentare', statsTitle: 'Die Reise in Zahlen', days: 'Tage', footprints: 'Fussabdrücke', totalKm: 'Strecke',
  southernmost: 'Südlichster Punkt', northernmost: 'Nördlichster Punkt', page: 'Seite',
  credit: 'Karten: NASA GIBS', colophon: 'Gemacht mit Kring',
};
const NAMES: Record<string, string> = { bruno: 'Bruno Kaiser', anna: 'Anna <Muster>' };
/** Test pagination: the html is cut at every page marker. */
const PAGINATE: PaginateText = (html) => html.split('<!--page-->');

function input(changes: JournalChange[], book: Partial<JournalBookModel> = {}, paginate: PaginateText = PAGINATE): BookInput {
  return {
    state: materialize(changes), journalKey: 'j1', book: { ...new JournalBookModel(), ...book }, labels: LABELS,
    authorName: (k) => NAMES[k] ?? k, paginate,
  };
}
const ofFootprint = (pages: BookPage[], key: string) => pages.filter((p) => p.footprintKey === key);
const texts = (page: BookPage | undefined, style?: string) =>
  (page?.frames ?? []).filter((f): f is Extract<BookFrame, { kind: 'text' }> => f.kind === 'text' && (!style || f.style === style)).map((f) => f.html).join('\n');
const photoKeys = (pages: BookPage[]) => pages.flatMap((p) => p.frames).flatMap((f) => (f.kind === 'photo' ? [f.imageKey] : []));

describe('layoutBook', () => {
  it('only published footprints are in the book, numbered 1…n in date order', () => {
    const { pages, title, period } = layoutBook(input([
      journal(), fp('b', '20270105'), fp('a', '20270103', { publishState: 'draft' }), fp('c', '20270102'),
    ]));
    const openings = pages.filter((p) => p.role === 'opening');
    expect(openings.map((p) => p.footprintKey)).toEqual(['c', 'b']);
    expect(texts(openings[0], 'title')).toContain('book-number">1<');
    expect(texts(openings[1], 'title')).toContain('book-number">2<');
    expect(pages[0].role).toBe('title');
    expect(texts(pages[0])).toContain('Antarktis');
    expect(texts(pages[0])).toContain('1.1.2027 – 10.1.2027');
    expect([title, period]).toEqual(['Antarktis', '1.1.2027 – 10.1.2027']);
    expect(pages.some((p) => p.footprintKey === 'a')).toBe(false);
  });

  it('the block order is kept: text, photos, text', () => {
    const { pages } = layoutBook(input([
      journal(), fp('f1', '20270102'), img('i1'), img('i2'), img('i3'),
      text('t1', 'f1', 'a', '<p>eins</p><!--page--><p>weiter</p>'), photos('p1', 'f1', 'b', ['i1', 'i2', 'i3']), text('t2', 'f1', 'c', '<p>zwei</p>'),
    ]));
    const own = ofFootprint(pages, 'f1');
    expect(own.map((p) => p.role)).toEqual(['opening', 'hero', 'text', 'photos', 'text']);
    expect(texts(own[0], 'body')).toContain('eins');
    expect(texts(own[2], 'body')).toContain('weiter');
    expect(own[3].blockKey).toBe('p1');
    expect(texts(own[4], 'body')).toContain('zwei');
  });

  it('the hero photo is not repeated in its album', () => {
    const changes = [journal(), fp('f1', '20270102'), img('i1'), img('i2'), img('i3'), photos('p1', 'f1', 'a', ['i1', 'i2', 'i3'])];
    const { pages } = layoutBook(input(changes, { albums: { p1: { pages: [{ template: 'hero-2', imageKeys: ['i1', 'i2', 'i3'] }] } } }));
    const own = ofFootprint(pages, 'f1');
    expect(own[1].role).toBe('hero');
    expect(photoKeys([own[1]])).toEqual(['i1']);
    expect(photoKeys(own.slice(2))).toEqual(['i2', 'i3']);
    const hiddenHero = ofFootprint(layoutBook(input(changes, { hiddenImageKeys: ['i1'] })).pages, 'f1');
    expect(photoKeys([hiddenHero[1]])).toEqual(['i2']);
    expect(photoKeys(hiddenHero)).toEqual(['i2', 'i3']);
  });

  it("a text block carries its author's name", () => {
    const { pages } = layoutBook(input([journal(), fp('f1', '20270102'), text('t1', 'f1', 'a', '<p>Hallo</p>', 'anna')]));
    const body = texts(ofFootprint(pages, 'f1')[0], 'body');
    expect(body).toContain('<p>Hallo</p><p class="book-author">Anna &lt;Muster&gt;</p>');
  });

  it('an author without a name gets no name line (ruling R13), in text runs and comments', () => {
    const changes = [journal(), fp('f1', '20270102'), text('t1', 'f1', 'a', '<p>Hallo</p>', 'nobody'), text('t2', 'f1', 'b', '<p>Du</p>', 'anna')];
    const noName = { ...input(changes), authorName: (k: string) => (k === 'anna' ? NAMES['anna'] : '') };
    const body = texts(ofFootprint(layoutBook(noName).pages, 'f1')[0], 'body');
    expect(body).toBe('<p>Hallo</p><p>Du</p><p class="book-author">Anna &lt;Muster&gt;</p>');
    expect(body).not.toContain('<p class="book-author"></p>');
    // the title page lists only the named authors
    expect(texts(layoutBook(noName).pages[0], 'author')).toBe('<p>Anna &lt;Muster&gt;</p>');
  });

  it('empty paragraphs are dropped before pagination (the DOM and pdfkit would disagree on them)', () => {
    expect(bookBlockHtml('<p>eins</p><p></p><p> &nbsp; </p><p><br></p><p class="x"><br/></p><p>zwei</p>')).toBe('<p>eins</p><p>zwei</p>');
    expect(bookBlockHtml('<p>🐧</p>')).toBe('');
    const paginate = vi.fn(PAGINATE);
    layoutBook(input([journal(), fp('f1', '20270102'), text('t1', 'f1', 'a', '<p>eins</p><p></p><p>zwei</p>')], {}, paginate));
    expect(paginate.mock.calls.find((c) => c[1] === 'body')?.[0]).toBe('<p>eins</p><p>zwei</p><p class="book-author">Bruno Kaiser</p>');
    // a block of nothing but empty paragraphs is no text block at all
    const { pages } = layoutBook(input([journal(), fp('f1', '20270102'), text('t1', 'f1', 'a', '<p></p><p><br></p>')]));
    expect(texts(ofFootprint(pages, 'f1')[0], 'body')).toBe('');
  });

  it('the photo count of the opening page: «1 Foto», «2 Fotos», none at 0', () => {
    const count = (keys: string[]) => texts(ofFootprint(layoutBook(input([
      journal(), fp('f1', '20270102'), img('i1'), img('i2'), ...(keys.length > 0 ? [photos('p1', 'f1', 'a', keys)] : []),
    ])).pages, 'f1')[0], 'stats');
    expect(count(['i1'])).toContain('<p>1 Foto</p>');
    expect(count(['i1', 'i2'])).toContain('<p>2 Fotos</p>');
    expect(count([])).not.toMatch(/Foto/);
  });

  it('consecutive text blocks flow on together', () => {
    const paginate = vi.fn(PAGINATE);
    const { pages } = layoutBook(input([
      journal(), fp('f1', '20270102'), text('t1', 'f1', 'a', '<p>eins</p>'), text('t2', 'f1', 'b', '<p>zwei</p>', 'anna'),
    ], {}, paginate));
    const own = ofFootprint(pages, 'f1');
    expect(own.map((p) => p.role)).toEqual(['opening']);
    expect(paginate).toHaveBeenCalledTimes(1);
    const body = texts(own[0], 'body');
    expect(body.indexOf('eins')).toBeLessThan(body.indexOf('Bruno Kaiser'));
    expect(body.indexOf('Bruno Kaiser')).toBeLessThan(body.indexOf('zwei'));
    expect(body).toContain('Anna &lt;Muster&gt;');
  });

  it('a footprint without blocks gives only its opening page', () => {
    const { pages } = layoutBook(input([journal(), fp('f1', '20270102'), fp('f2', '20270103'), text('t1', 'f2', 'a', '<p>x</p>')]));
    expect(ofFootprint(pages, 'f1').map((p) => p.role)).toEqual(['opening']);
  });

  it('comments appear only when switched on, only the chosen ones, with the like count', () => {
    const comment = (key: string, text: string, at: string) =>
      rec('comment', key, { footprintKey: 'f1', text, authorName: `Gast ${key}`, createdAt: at }, `guest-${key}`);
    const like = (person: string) => rec('reaction', `f1_${person}`, { footprintKey: 'f1', type: 'like' }, person);
    const changes = [
      journal(), fp('f1', '20270102'), fp('f2', '20270103'), text('t1', 'f1', 'a', '<p>x</p>'),
      comment('c1', 'Schön', '2027-01-02T10:00:00Z'), comment('c2', 'Nicht gewählt', '2027-01-02T11:00:00Z'), comment('c3', 'Toll & gut', '2027-01-02T12:00:00Z'),
      like('anna'), like('beat'),
    ];
    const off = layoutBook(input(changes, { footprints: { f1: { showComments: false, commentKeys: ['c1'] } } })).pages;
    expect(off.some((p) => p.role === 'comments')).toBe(false);
    const on = layoutBook(input(changes, { footprints: { f1: { showComments: true, commentKeys: ['c3', 'c1'] } } })).pages;
    const own = ofFootprint(on, 'f1');
    expect(own.map((p) => p.role)).toEqual(['opening', 'comments']);
    const html = texts(own[1], 'comment');
    expect(html).toContain('Schön');
    expect(html).toContain('Toll &amp; gut');
    expect(html).toContain('Gast c3');
    expect(html).not.toContain('Nicht gewählt');
    expect(html.indexOf('Schön')).toBeLessThan(html.indexOf('Toll'));
    expect(html).toContain('♥ 2');
    expect(ofFootprint(on, 'f2').map((p) => p.role)).toEqual(['opening']);
  });

  it('hidden photos are neither on a page nor counted in the stats', () => {
    const { pages, stats } = layoutBook(input(
      [journal(), fp('f1', '20270102'), img('i1'), img('i2'), img('i3'), photos('p1', 'f1', 'a', ['i1', 'i2', 'i3'])],
      { hiddenImageKeys: ['i2'] },
    ));
    expect(photoKeys(pages)).not.toContain('i2');
    expect(photoKeys(pages).sort()).toEqual(['i1', 'i3']);
    expect(stats.photos).toBe(2);
    expect(texts(ofFootprint(pages, 'f1')[0], 'stats')).toContain('2 Fotos');
  });

  it('a footprint without position has no stretch', () => {
    const { pages, mapFiles, stats } = layoutBook(input([
      journal(), fp('f1', '20270102', { latitude: -54.8, longitude: -68.3 }), fp('f2', '20270103'),
      fp('f3', '20270104', { latitude: -62.0, longitude: -58.0, transport: 'ship' }),
    ]));
    const map = (p: BookPage) => p.frames.find((f) => f.kind === 'map');
    const [o1, o2, o3] = pages.filter((p) => p.role === 'opening');
    expect(map(o1)).toBeUndefined();
    expect(map(o2)).toBeUndefined();
    expect(texts(o2, 'stats')).toContain('Etappe: – km');
    expect(map(o3)).toMatchObject({ kind: 'map', file: 'book-map-f3.jpg' });
    const km = routeLengthKm([[-54.8, -68.3], [-62.0, -58.0]]);
    expect(texts(o3, 'stats')).toContain(`Etappe: ${km} km · Unterwegs mit Schiff`);
    expect(stats.km).toBe(km);
    expect(mapFiles).toEqual(['book-map-overview.jpg', 'book-map-f3.jpg']);
    expect(pages[1].role).toBe('overview');
    expect(pages[1].frames.find((f) => f.kind === 'map')).toMatchObject({ file: 'book-map-overview.jpg' });
  });

  it('stats: days, km per transport, extreme latitude', () => {
    const south = layoutBook(input([
      journal(),
      fp('f1', '20270101', { latitude: -54.8, longitude: -68.3 }),
      fp('f2', '20270103', { latitude: -63.0, longitude: -60.6, transport: 'ship' }),
      fp('f3', '20270105', { latitude: -62.0, longitude: -58.0 }),
      fp('f4', '20270108', { latitude: -54.8, longitude: -68.3, transport: 'plane' }),
    ]));
    const leg = (a: [number, number], b: [number, number]) => routeLengthKm([a, b]);
    const ship = leg([-54.8, -68.3], [-63.0, -60.6]);
    const none = leg([-63.0, -60.6], [-62.0, -58.0]);
    expect(south.stats.days).toBe(10);
    expect(south.stats.footprints).toBe(4);
    expect(south.stats.kmByTransport['ship']).toBe(ship);
    expect(south.stats.kmByTransport['none']).toBe(none);
    expect(south.stats.kmByTransport['plane']).toBeGreaterThan(0);
    expect(south.stats.km).toBe(ship + none + south.stats.kmByTransport['plane']);
    expect(south.stats.extremeLat).toBe(-63.0);
    expect(texts(ofFootprint(south.pages, 'f2')[0], 'stats')).toContain('Tag 3');
    const statsPage = south.pages.find((p) => p.role === 'stats');
    expect(texts(statsPage, 'stats')).toContain('Südlichster Punkt: 63° 0′ S');
    expect(texts(statsPage, 'stats')).toContain('ohne Angabe');
    expect(texts(statsPage)).toContain('Gemacht mit Kring');
    const north = layoutBook(input([journal({ endDate: '' }), fp('f1', '20270101', { latitude: 47.4, longitude: 8.5 }), fp('f2', '20270104', { latitude: 64.1, longitude: -21.9 })]));
    expect(north.stats.extremeLat).toBe(64.1);
    expect(north.stats.days).toBe(4);
    expect(texts(north.pages.find((p) => p.role === 'stats'), 'stats')).toContain('Nördlichster Punkt: 64° 6′ N');
  });

  it('pages are padded with blank pages to the page multiple', () => {
    const changes = [journal(), fp('f1', '20270102'), fp('f2', '20270103')];
    const four = layoutBook(input(changes)).pages; // title, 2 openings, stats = 4
    expect(four.length).toBe(4);
    const six = layoutBook(input(changes, { print: { bleedMm: 3, pageMultiple: 6, iccProfile: 'fogra39', cover: 'none' } })).pages;
    expect(six.length).toBe(6);
    expect(six.slice(4).map((p) => [p.role, p.frames.length])).toEqual([['blank', 0], ['blank', 0]]);
    const five = layoutBook(input([...changes, fp('f3', '20270104')])).pages;
    expect(five.length).toBe(8);
    expect(five[4].role).toBe('stats');
  });

  it('the cover photo defaults to the journal cover, else the first photo', () => {
    // the journal cover (JournalModel.cover, an ImageConfig on the Firestore doc) is not in the change-log state,
    // so the default falls through to the first visible photo of the first published footprint
    const changes = [
      journal(), fp('d', '20270101', { publishState: 'draft' }), img('i0'), photos('p0', 'd', 'a', ['i0']),
      fp('f1', '20270102'), text('t1', 'f1', 'a', '<p>x</p>'), fp('f2', '20270103'), img('i1'), img('i2'), img('i3'), photos('p2', 'f2', 'a', ['i1', 'i2']),
    ];
    const state = materialize(changes);
    const book = (b: Partial<JournalBookModel>): JournalBookModel => ({ ...new JournalBookModel(), ...b });
    expect(coverImageKeyOf(state, 'j1', book({ coverImageKey: 'i3' }))).toBe('i3');
    expect(coverImageKeyOf(state, 'j1', book({ coverImageKey: 'unknown' }))).toBe('i1');
    expect(coverImageKeyOf(state, 'j1', book({}))).toBe('i1');
    expect(coverImageKeyOf(state, 'j1', book({ hiddenImageKeys: ['i1'] }))).toBe('i2');
    expect(coverImageKeyOf(state, 'j1', book({ hiddenImageKeys: ['i1', 'i2'] }))).toBeUndefined();
    const bookInput = input(changes, { print: { bleedMm: 3, pageMultiple: 4, iccProfile: 'fogra39', cover: 'softcover', spineMm: 8 } });
    const layout = layoutBook(bookInput);
    expect(layout.coverImageKey).toBe('i1');
    const cover = coverLayout(bookInput.book, layout.title, layout.period, layout.coverImageKey);
    expect(cover?.frames.find((f) => f.kind === 'photo')).toMatchObject({ imageKey: 'i1' });
  });

  it('a short override page is re-laid out without empty slots', () => {
    const changes = [journal(), fp('f1', '20270102'), img('i1'), img('i2'), img('i3'), img('i4'), photos('p1', 'f1', 'a', ['i1', 'i2', 'i3', 'i4'])];
    const full = (pages: BookPage[]) => pages.filter((p) => p.role === 'photos')
      .every((p) => p.template !== undefined && p.frames.length === templateBoxes(p.template, 3).length);
    // the hero (i1) leaves the hand-set hero-3 page with three photos
    const heroCut = layoutBook(input(changes, { albums: { p1: { pages: [{ template: 'hero-3', imageKeys: ['i1', 'i2', 'i3', 'i4'] }] } } })).pages;
    expect(full(heroCut)).toBe(true);
    expect(photoKeys(heroCut.filter((p) => p.role === 'photos'))).toEqual(['i2', 'i3', 'i4']);
    expect(heroCut.find((p) => p.role === 'photos')?.template).toBe('hero-2');
    // a hidden photo leaves a two-landscape page with one
    const hidden = layoutBook(input(changes, {
      hiddenImageKeys: ['i3'],
      albums: { p1: { pages: [{ template: 'two-landscape', imageKeys: ['i2', 'i3'] }, { template: 'full', imageKeys: ['i4'] }] } },
    })).pages;
    expect(full(hidden)).toBe(true);
    expect(hidden.filter((p) => p.role === 'photos').map((p) => [p.template, photoKeys([p])])).toEqual([['full', ['i2']], ['full', ['i4']]]);
  });

  it('warnings: missing print photo, below 300, below 200', () => {
    const { pages, warnings } = layoutBook(input([
      journal(),
      fp('f1', '20270102'), img('i1'), photos('p1', 'f1', 'a', ['i1']),
      fp('f2', '20270103'), img('i2'), photos('p2', 'f2', 'a', ['i2']),
      fp('f3', '20270104'), img('i3'), photos('p3', 'f3', 'a', ['i3']),
      fp('f4', '20270105'), img('i4', 2048, 1536), photos('p4', 'f4', 'a', ['i4']),
    ], { prints: { i1: { width: 4032, height: 3024 }, i2: { width: 3000, height: 2000 }, i3: { width: 2000, height: 1500 } } }));
    const heroIndex = (key: string) => pages.findIndex((p) => p.role === 'hero' && p.footprintKey === key);
    expect(warnings).toEqual([
      { pageIndex: heroIndex('f2'), imageKey: 'i2', level: 'poor', dpi: 235 },
      { pageIndex: heroIndex('f3'), imageKey: 'i3', level: 'veryPoor', dpi: 168 },
      { pageIndex: heroIndex('f4'), imageKey: 'i4', level: 'missing', dpi: 172 },
    ]);
  });
});

describe('cover warning', () => {
  it('the cover front photo is checked like a page photo, as pageIndex COVER_PAGE_INDEX', () => {
    const changes = [journal(), fp('f1', '20270102'), img('i1'), photos('p1', 'f1', 'a', ['i1'])];
    const print = { ...new JournalBookModel().print, cover: 'softcover' as const, bleedMm: 3, spineMm: 10 };
    const prints = { i1: { width: 3000, height: 2000 } };
    const { warnings } = layoutBook(input(changes, { print, prints }));
    const cover = warnings.find((w) => w.pageIndex === COVER_PAGE_INDEX);
    // front photo 300 × 216 mm (297 + bleed, 210 + 2 × bleed) from 3000 × 2000 px: fill by height → 2000 px / 8.5 in
    expect(cover).toEqual({ pageIndex: -1, imageKey: 'i1', level: 'poor', dpi: 235 });
    expect(layoutBook(input(changes, { prints })).warnings.some((w) => w.pageIndex === COVER_PAGE_INDEX)).toBe(false); // no cover ordered
    expect(layoutBook(input(changes, { print })).warnings.find((w) => w.pageIndex === COVER_PAGE_INDEX)?.level).toBe('missing');
  });
});

describe('localViewDateTime', () => {
  it('shows an ISO instant in local time, not UTC', () => {
    const iso = '2026-10-25T23:30:00.000Z';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(localViewDateTime(iso)).toBe(`${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
    expect(localViewDateTime('garbage')).toBe('');
    expect(localViewDateTime(undefined)).toBe('');
  });
});

describe('coverLayout', () => {
  it("coverLayout is undefined for 'none' and 2 × (297 + bleed) + spine + 2 × wrap wide otherwise", () => {
    const book = (print: Partial<JournalBookModel['print']>): JournalBookModel =>
      ({ ...new JournalBookModel(), print: { ...new JournalBookModel().print, ...print } });
    expect(coverLayout(book({ cover: 'none' }), 'T', 'P', 'i1')).toBeUndefined();
    const soft = coverLayout(book({ cover: 'softcover', bleedMm: 3, spineMm: 10 }), 'Antarktis', '1.1.2027', 'i1');
    expect(soft?.width).toBe(2 * (297 + 3) + 10);
    expect(soft?.height).toBe(210 + 2 * 3);
    expect(soft?.frames.find((f) => f.kind === 'photo')).toMatchObject({ imageKey: 'i1', box: { x: 3 + 297 + 10, y: 0, w: 297 + 3, h: 216 } });
    expect(soft?.frames.find((f) => f.kind === 'map')).toMatchObject({ file: 'book-map-back.jpg' });
    expect(soft?.frames.some((f) => f.kind === 'text' && f.rotate === 90)).toBe(true);
    const hard = coverLayout(book({ cover: 'hardcover', bleedMm: 3, spineMm: 4, wrapMm: 15 }), 'A', 'B', undefined);
    expect(hard?.width).toBe(2 * (297 + 3) + 4 + 2 * 15);
    expect(hard?.height).toBe(210 + 2 * (3 + 15));
    expect(hard?.frames.some((f) => f.kind === 'photo')).toBe(false);
    expect(hard?.frames.some((f) => f.kind === 'text' && f.rotate === 90)).toBe(false); // spine < 6 mm: no spine title
    const noBleed = coverLayout({ ...book({ cover: 'softcover' }), print: { pageMultiple: 4, iccProfile: 'fogra39', cover: 'softcover' } as JournalBookModel['print'] }, 'A', 'B', undefined);
    expect(noBleed?.width).toBe(2 * (297 + 3)); // bleed defaults to 3 mm, as in layoutBook
  });
});

describe('stripEmoji', () => {
  it('stripEmoji removes pictographs and keeps umlauts, «», –, °', () => {
    expect(stripEmoji('Grüezi 🐧 «Pinguine» – 3 °C 👍🏽 🇨🇭')).toBe('Grüezi «Pinguine» – 3 °C');
    expect(stripEmoji('Ölfeld ❤️ Ära 👨‍👩‍👧 ß 1️⃣')).toBe('Ölfeld Ära ß 1');
    expect(stripEmoji('© swisstopo, 54° 48′ S')).toBe('© swisstopo, 54° 48′ S');
    // ↔ and ☀ are in the print fonts (Plex Serif, Inter Tight): kept; ✈ is in neither
    expect(stripEmoji('Zürich ↔ Ushuaia ☀️ ✈️')).toBe('Zürich ↔ Ushuaia ☀');
  });
});

describe('bookPrintCandidates', () => {
  const build = (extra: JournalChange[] = []) => materialize([
    journal(), fp('f1', '20270102'), fp('f2', '20270103'), fp('d', '20270104', { publishState: 'draft' }),
    img('i1'), img('i2'), img('i3'), img('i4'), img('i5'),
    photos('s1', 'f1', 'a', ['i1', 'i2']), photos('s2', 'f2', 'a', ['i3', 'i2']), photos('s3', 'd', 'a', ['i4']),
    ...extra,
  ]);
  const keys = (list: { key: string }[]) => list.map((i) => i.key);
  const book = (b: Partial<JournalBookModel> = {}) => ({ ...new JournalBookModel(), ...b });

  it('takes the images of published footprints, each once, in footprint order (drafts and unplaced images are left out)', () => {
    expect(keys(bookPrintCandidates(build(), 'j1', book(), 'bruno'))).toEqual(['i1', 'i2', 'i3']);
  });
  it('skips hidden images but keeps a hidden cover', () => {
    expect(keys(bookPrintCandidates(build(), 'j1', book({ hiddenImageKeys: ['i2', 'i1'], coverImageKey: 'i1' }), 'bruno'))).toEqual(['i1', 'i3']);
  });
  it('skips images already in prints', () => {
    expect(keys(bookPrintCandidates(build(), 'j1', book({ prints: { i1: { width: 3000, height: 2000 } } }), 'bruno'))).toEqual(['i2', 'i3']);
  });
  it('only returns the own photos (the other author exports theirs)', () => {
    const state = materialize([journal(), fp('f1', '20270102'), img('i1'), rec('image', 'i2', { journalKey: 'j1', width: 1, height: 1, path2048: 'a', path400: 'b', localIdentifier: 'x' }, 'anna'),
      photos('s1', 'f1', 'a', ['i1', 'i2'])]);
    expect(keys(bookPrintCandidates(state, 'j1', book(), 'anna'))).toEqual(['i2']);
    expect(keys(bookPrintCandidates(state, 'j1', book(), 'bruno'))).toEqual(['i1']);
  });
  it('skips an image without a Photos identifier', () => {
    const state = materialize([journal(), fp('f1', '20270102'), rec('image', 'i1', { journalKey: 'j1', width: 1, height: 1, path2048: 'a', path400: 'b', localIdentifier: '' }),
      photos('s1', 'f1', 'a', ['i1'])]);
    expect(bookPrintCandidates(state, 'j1', book(), 'bruno')).toEqual([]);
  });
});
