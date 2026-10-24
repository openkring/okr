import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';

import type { BookPage } from '@okr/travel-journal-util';

import { htmlToRuns } from './book-html';
import { applyPdfX4, bookAsset, createBookDoc, glyphSegments, pdfkitPaginate, writeBookPdf } from './book-pdf';

// a 4 × 3 px RGB JPEG
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAAAwAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAwAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A8Pooor+dz/SA/9k=', 'base64');

const pt = (mm: number) => Math.round(((mm * 72) / 25.4) * 1e6) / 1e6;

const PAGES: BookPage[] = [
  {
    role: 'opening',
    frames: [
      { kind: 'text', box: { x: 12, y: 12, w: 132, h: 22 }, html: '<p><span class="book-number">1</span> Ushuaia</p>', style: 'title' },
      { kind: 'text', box: { x: 12, y: 40, w: 132, h: 40 }, html: '<p class="book-likes">♥ 12</p>', style: 'comment' },
      { kind: 'photo', box: { x: 150, y: 12, w: 135, h: 186 }, imageKey: 'img1', fit: 'fill' },
      { kind: 'map', box: { x: 12, y: 90, w: 60, h: 40 }, file: 'book-map-f1.jpg' },
    ],
  },
  { role: 'hero', frames: [{ kind: 'photo', box: { x: -3, y: -3, w: 303, h: 216 }, imageKey: 'gone', fit: 'whole' }] },
];

async function render(x4: boolean): Promise<{ pdf: string; missing: string[] }> {
  const doc = createBookDoc();
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const ended = new Promise((resolve) => doc.on('end', resolve));
  const missing: string[] = [];
  if (x4) applyPdfX4(doc, { title: 'Antarktis & zurück', iccFogra: bookAsset('ISOcoated_v2_eci.icc'), trim: { w: 297, h: 210 }, bleedMm: 3 });
  await writeBookPdf(doc, PAGES, {
    bleedMm: x4 ? 3 : 0, x4,
    image: async (key) => (key === 'img1' ? JPEG : (missing.push(key), undefined)),
    mapImage: async (file) => (missing.push(file), undefined),
  });
  doc.end();
  await ended;
  return { pdf: Buffer.concat(chunks).toString('latin1'), missing };
}

describe('book pdf', () => {
  it('applyPdfX4 writes OutputIntents GTS_PDFX, the X-4 XMP keys, Trapped False and Trim/Bleed boxes', async () => {
    const { pdf, missing } = await render(true);
    expect(pdf.startsWith('%PDF-1.6')).toBe(true);
    expect(pdf).toContain('/GTS_PDFX');
    expect(pdf).toContain('/OutputConditionIdentifier (FOGRA39)');
    expect(pdf).toMatch(/\/DestOutputProfile \d+ 0 R/);
    expect(pdf).toMatch(/\/N 4\b/);
    expect(pdf).toContain('pdfxid:GTS_PDFXVersion>PDF/X-4');
    expect(pdf).toContain('<pdf:Trapped>False</pdf:Trapped>');
    expect(pdf).toContain(Buffer.from('Antarktis &amp; zurück', 'utf8').toString('latin1')); // XMP is UTF-8
    expect(pdf).toMatch(/xmpMM:DocumentID>uuid:[0-9a-f-]{36}</);
    expect(pdf).toContain('/Trapped /False');
    const media = `[0 0 ${pt(303)} ${pt(216)}]`;
    expect(pdf.split(`/MediaBox ${media}`).length - 1).toBe(2);
    expect(pdf.split(`/BleedBox ${media}`).length - 1).toBe(2);
    expect(pdf.split(`/TrimBox [${pt(3)} ${pt(3)} ${pt(300)} ${pt(213)}]`).length - 1).toBe(2);
    expect(pdf).toMatch(/\/DefaultRGB \[\/ICCBased \d+ 0 R\]/);
    expect(pdf).toMatch(/\/ColorSpace \[\/ICCBased \d+ 0 R\]\n\/Filter \/DCTDecode/); // the photo, sRGB-tagged
    expect(pdf).toMatch(/\/FontFile2 \d+ 0 R/); // embedded TrueType
    expect(pdf).not.toContain('/Annots');
    expect(pdf).not.toContain('/Encrypt');
    expect(missing).toEqual(['book-map-f1.jpg', 'gone']); // left black, the pages are still there
  });

  it('a screen pdf has no bleed and no PDF/X', async () => {
    const { pdf } = await render(false);
    expect(pdf).not.toContain('GTS_PDFX');
    expect(pdf).not.toContain('/TrimBox');
    expect(pdf.split(`/MediaBox [0 0 ${pt(297)} ${pt(210)}]`).length - 1).toBe(2);
    expect(pdf).toMatch(/\/ColorSpace \/DeviceRGB\n\/Filter \/DCTDecode/);
  });

  it('applyPdfX4 refuses a page that is not trim plus bleed', () => {
    const doc = new PDFDocument({ pdfVersion: '1.6', autoFirstPage: false });
    applyPdfX4(doc, { title: 't', iccFogra: bookAsset('ISOcoated_v2_eci.icc'), trim: { w: 297, h: 210 }, bleedMm: 3 });
    expect(() => doc.addPage({ size: 'A4', margin: 0 })).toThrow(/trim/);
  });

  it('glyphSegments draws ♥ with the sans font and drops what no font has', () => {
    const has = (font: string, cp: number) => cp < 0x2000 || (font === 'sans' && cp === 0x2665);
    expect(glyphSegments('♥ 12 😀!', 'serif', has)).toEqual([
      { text: '♥', font: 'sans' },
      { text: ' 12 !', font: 'serif' },
    ]);
  });

  it('the print fonts carry ♥ (Inter Tight) for the like line', () => {
    const doc = createBookDoc();
    doc.font('sans');
    expect((doc as unknown as { _font: { font: { hasGlyphForCodePoint(cp: number): boolean } } })._font.font.hasGlyphForCodePoint(0x2665)).toBe(true);
  });

  it('pdfkitPaginate splits a long text into chunks that keep every word, in order', () => {
    const doc = createBookDoc();
    const words = Array.from({ length: 900 }, (_, i) => `Wort${i}`);
    const html = `<h3>Der Tag</h3><p>${words.slice(0, 450).join(' ')}</p><ul><li>${words.slice(450, 500).join(' ')}</li></ul><p>${words.slice(500).join(' ')}</p>`;
    const first = { x: 12, y: 96, w: 132, h: 102 };
    const next = { x: 48.5, y: 12, w: 200, h: 186 };
    const chunks = pdfkitPaginate(doc)(html, 'body', first, next);
    expect(chunks.length).toBeGreaterThan(2);
    const text = chunks.flatMap((c) => htmlToRuns(c)).map((r) => r.text).join(' ').split(/\s+/).filter((w) => w.startsWith('Wort'));
    expect(text).toEqual(words);
    // the first chunk is the smaller one: the opening page's column holds fewer words than a text page
    const count = (c: string) => (c.match(/Wort/g) ?? []).length;
    expect(count(chunks[0])).toBeLessThan(count(chunks[1]));
    // the list item continued on a later page has no second bullet
    const items = chunks.flatMap((c) => htmlToRuns(c)).filter((r) => r.list && r.bullet !== undefined);
    expect(items.filter((r) => r.bullet === '•').length).toBe(1);
    expect(pdfkitPaginate(doc)('', 'body', first, next)).toEqual([]);
  });
});
