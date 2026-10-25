import { describe, expect, it } from 'vitest';
import { BookPageOverride, JournalBookModel, JournalChange } from '@okr/shared-models';
import { signal } from '@angular/core';

import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { BookLabels, BookLayout, layoutBook, MAP_BACK, MAP_OVERVIEW, mapFileOf } from './journal-book.util';
import {
  blockPagesOf, missingPrintsByAuthor, movePhotoTo, photosFrom, slotCount, spreadsOf, templateFor, withTemplate,
} from './journal-book-edit.util';
import { bookMapPlan } from './journal-book-map-plan.util';
import { BOOK_I18N_KEYS, BOOK_LABEL_MAX, bookLabelsOf, JournalBookI18n } from './journal-book-i18n';
import { imagesOf } from './journal-view.util';

let n = 0;
function rec(entity: JournalChange['entity'], entityKey: string, fields: Record<string, unknown>, authorKey = 'bruno'): JournalChange {
  n += 1;
  const deviceId = `dev-${authorKey}`;
  return { id: `r${n}`, journalKey: 'j1', deviceId, seq: n, hlc: formatHlc({ wall: 1000 + n, counter: 0, deviceId }), authorKey, entity, entityKey, op: 'create', fields };
}
const journal = () => rec('journal', 'j1', { title: 'Antarktis', subTitle: '', startDate: '20270101', endDate: '20270110' });
const fp = (key: string, date: string, fields: Record<string, unknown> = {}) =>
  rec('footprint', key, { journalKey: 'j1', title: `Ort ${key}`, placeName: '', date, time: '10:00', publishState: 'published', ...fields });
const photos = (key: string, footprintKey: string, order: string, imageKeys: string[]) =>
  rec('section', key, { footprintKey, kind: 'photos', imageKeys, order });
const img = (key: string, width = 4000, height = 3000, author = 'bruno') =>
  rec('image', key, { journalKey: 'j1', width, height, path2048: `${key}.jpg`, path400: `${key}-400.jpg`, localIdentifier: key }, author);

const LABELS = {
  day: 'Tag', stretch: 'Etappe', cumulative: 'Gesamt', km: 'km', photo: 'Foto', photos: 'Fotos', weather: 'Wetter', transportVia: 'Unterwegs mit',
  noTransport: 'ohne Angabe', transport: { plane: 'Flugzeug', ship: 'Schiff', bus: 'Bus', train: 'Zug', car: 'Auto', bike: 'Velo', foot: 'zu Fuss' },
  north: 'N', south: 'S', east: 'O', west: 'W', comments: 'Kommentare', statsTitle: 'Zahlen', days: 'Tage', footprints: 'Footprints',
  totalKm: 'Strecke', southernmost: 'Süd', northernmost: 'Nord', page: 'Seite', credit: '', colophon: '',
} satisfies BookLabels;

function layout(changes: JournalChange[], book: Partial<JournalBookModel> = {}): BookLayout {
  return layoutBook({
    state: materialize(changes), journalKey: 'j1', book: { ...new JournalBookModel(), ...book }, labels: LABELS, authorName: (k) => k,
    paginate: (html) => [html],
  });
}

const page = (template: BookPageOverride['template'], ...imageKeys: string[]): BookPageOverride => ({ template, imageKeys });

describe('book page editing', () => {
  it('slot counts of the five templates', () => {
    expect(['full', 'two-portrait', 'two-landscape', 'hero-2', 'hero-3'].map((t) => slotCount(t as BookPageOverride['template']))).toEqual([1, 2, 2, 3, 4]);
  });

  it('blockPagesOf lists the album pages of a block without the hero page', () => {
    const l = layout([journal(), fp('f1', '20270102'), ...['a', 'b', 'c', 'd'].map((k) => img(k)), photos('p1', 'f1', 'a', ['a', 'b', 'c', 'd'])]);
    expect(blockPagesOf(l, 'p1')).toEqual([page('hero-2', 'b', 'c', 'd')]);
  });

  it('withTemplate fills the page from its own first photo and refills the following pages', () => {
    const pages = [page('full', 'a'), page('two-landscape', 'b', 'c'), page('two-landscape', 'd', 'e')];
    expect(withTemplate(pages, 1, 'hero-3')).toEqual([page('full', 'a'), page('hero-3', 'b', 'c', 'd', 'e')]);
    expect(withTemplate(pages, 1, 'full')).toEqual([page('full', 'a'), page('full', 'b'), page('two-landscape', 'c', 'd')]);
    expect(photosFrom(pages, 1)).toBe(4);
  });

  it('movePhotoTo moves a photo to another page of the block and re-picks both templates', () => {
    const images = imagesOf(materialize([img('a'), img('b'), img('c', 3000, 4000), img('d', 3000, 4000)]), 'j1');
    const pages = [page('two-landscape', 'a', 'b'), page('two-portrait', 'c', 'd')];
    expect(movePhotoTo(pages, 'a', 1, images)).toEqual([page('full', 'b'), page('hero-2', 'c', 'd', 'a')]);
    expect(movePhotoTo([page('full', 'a'), page('full', 'b')], 'a', 1, images)).toEqual([page('two-landscape', 'b', 'a')]);
    expect(movePhotoTo(pages, 'a', 0, images)).toBe(pages);
  });

  it('templateFor picks by photo count and orientation', () => {
    expect(templateFor([{ width: 2, height: 3 }, { width: 2, height: 3 }])).toBe('two-portrait');
    expect(templateFor([{ width: 3, height: 2 }, { width: 2, height: 3 }])).toBe('two-landscape');
    expect(templateFor([{ width: 3, height: 2 }])).toBe('full');
    expect(templateFor(Array(5).fill({ width: 3, height: 2 }))).toBe('hero-3');
  });

  it('spreads put the first page alone on the right', () => {
    expect(spreadsOf(0)).toEqual([]);
    expect(spreadsOf(1)).toEqual([[undefined, 0]]);
    expect(spreadsOf(4)).toEqual([[undefined, 0], [1, 2], [3, undefined]]);
    expect(spreadsOf(5)).toEqual([[undefined, 0], [1, 2], [3, 4]]);
  });

  it('missing print photos are counted by the photo author', () => {
    const changes = [journal(), fp('f1', '20270102'), img('a'), img('b', 4000, 3000, 'anna'), img('c', 4000, 3000, 'anna'), photos('p1', 'f1', 'a', ['a', 'b', 'c'])];
    const book = { ...new JournalBookModel(), prints: { a: { width: 3579, height: 2551 } } };
    const missing = missingPrintsByAuthor(layout(changes, book), book, imagesOf(materialize(changes), 'j1'));
    expect([...missing]).toEqual([['anna', 2]]);
  });
});

describe('bookMapPlan', () => {
  const changes = [
    journal(),
    fp('f1', '20270102', { latitude: -54.8, longitude: -68.3 }),
    fp('f2', '20270103'), // no position: numbered, but on no map
    fp('f3', '20270104', { latitude: -64.8, longitude: -62.5, transport: 'ship' }),
  ];

  it('one entry per map file with its frame; stops carry the book numbers', () => {
    const book = { ...new JournalBookModel(), print: { bleedMm: 3, pageMultiple: 4, iccProfile: 'fogra39' as const, cover: 'hardcover' as const, spineMm: 10, wrapMm: 15 } };
    const l = layout(changes, book);
    const plan = bookMapPlan(materialize(changes), 'j1', book, l);
    expect(plan.map((p) => p.file)).toEqual([MAP_OVERVIEW, mapFileOf('f3'), MAP_BACK]);
    expect(plan[0].stops.map((s) => s.n)).toEqual([1, 3]);
    expect(plan[0].box).toEqual({ x: -3, y: -3, w: 303, h: 216 });
    expect(plan[1].route).toEqual([[-68.3, -54.8], [-62.5, -64.8]]);
    expect(plan[1].legPath?.length).toBeGreaterThanOrEqual(2);
    expect(plan[2].box.w).toBe(120);
  });
});

describe('bookLabelsOf', () => {
  const i18n = Object.fromEntries(Object.keys(BOOK_I18N_KEYS).map((k) => [k, signal(k === 'label_credit' ? 'Karten: {sources}' : k)])) as unknown as JournalBookI18n;
  const transport = LABELS.transport;

  it('fills the credit with the imagery sources, tags removed and each once', () => {
    const labels = bookLabelsOf(i18n, transport, ['Imagery: <a href="x">NASA GIBS</a>', 'Imagery: NASA GIBS', 'swisstopo']);
    expect(labels.credit).toBe('Karten: Imagery: NASA GIBS · swisstopo');
    expect(labels.day).toBe('label_day');
    expect(labels.transport.ship).toBe('Schiff');
  });

  it('no sources, no credit line; every label at most 200 characters', () => {
    expect(bookLabelsOf(i18n, transport, []).credit).toBe('');
    const long = bookLabelsOf(i18n, transport, ['x'.repeat(300)]);
    expect(long.credit.length).toBe(BOOK_LABEL_MAX);
  });
});
