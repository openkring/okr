import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

import PDFDocument from 'pdfkit';

import { BOOK_FONT_FILES, BOOK_GREY, BOOK_HEADING_SCALE, BOOK_LIST_INDENT_EM, BOOK_SMALL_SCALE, BOOK_TEXT_STYLES } from '@okr/travel-journal-util';
import type { BookFont, BookFrame, BookPage, BookTextStyle, Box, PaginateText, TextStyle } from '@okr/travel-journal-util';

import { htmlToRuns, runsToHtml, TextRun } from './book-html';

/*
 * The travel book as PDF (design 2026-10-24 §7): the pages of layoutBook drawn with pdfkit, photos embedded as the
 * JPEGs they are, on a black page (no frame carries the background). The print file is PDF/X-4 (applyPdfX4), the
 * screen file a plain PDF without bleed. Text is laid out here (not by pdfkit's wrapper) so that pagination and
 * drawing measure the very same lines.
 */

const PT_PER_MM = 72 / 25.4;
export const mmToPt = (mm: number): number => mm * PT_PER_MM;

const PAGE_W_MM = 297;
const PAGE_H_MM = 210;

// ---------------------------------------------------------------------------------------------------------------
// assets and fonts

/** The four faces of the book (BOOK_FONT_FILES, shared with the preview); the sans also carries ♥ and ☀, which Plex Serif lacks. */
export type FontKey = BookFont;
const FONT_FILES = BOOK_FONT_FILES;

/** `assets/book` next to the bundle (dist/apps/functions/main.js), or src/assets/book from this source file. */
function assetDir(): string {
  const candidates = [join(__dirname, 'assets', 'book'), join(__dirname, '..', 'assets', 'book')];
  const dir = candidates.find((d) => existsSync(join(d, FONT_FILES.serif)));
  if (!dir) throw new Error(`book assets not found (looked in ${candidates.join(', ')})`);
  return dir;
}

export function bookAsset(name: string): Buffer {
  return readFileSync(join(assetDir(), name));
}

/** A book document: PDF 1.6, no automatic page, the four book fonts registered (embedded as subsets on end). */
export function createBookDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ pdfVersion: '1.6', autoFirstPage: false, info: { Producer: 'PDFKit', Creator: 'PDFKit' } });
  const dir = assetDir();
  for (const [key, file] of Object.entries(FONT_FILES)) doc.registerFont(key, join(dir, file));
  return doc;
}

// ---------------------------------------------------------------------------------------------------------------
// text styles

// one typography for the PDF and the preview (journal-book-typography.ts)
type StyleSpec = BookTextStyle;
const STYLES = BOOK_TEXT_STYLES;
const GREY = BOOK_GREY;

function runFont(run: TextRun, base: FontKey): FontKey {
  if (run.cls || run.heading) return 'sans';
  if (run.bold) return 'serifBold';
  if (run.italic) return base === 'serifItalic' ? 'serif' : 'serifItalic';
  return base;
}
function runSize(run: TextRun, st: StyleSpec): number {
  if (run.heading) return st.size * BOOK_HEADING_SCALE;
  if (run.cls === 'author' || run.cls === 'likes') return st.size * BOOK_SMALL_SCALE;
  return st.size;
}
const runColor = (run: TextRun, st: StyleSpec): string => (run.cls === 'author' || run.cls === 'number' ? GREY : st.color);

// ---------------------------------------------------------------------------------------------------------------
// glyphs and measuring

export type HasGlyph = (font: FontKey, codePoint: number) => boolean;

/**
 * Splits text by the font that can draw it: the run's own font, else the sans (Inter Tight has ♥, arrows, more
 * symbols), else the code point is dropped — a missing glyph would print as an empty box.
 */
export function glyphSegments(text: string, font: FontKey, has: HasGlyph): { text: string; font: FontKey }[] {
  const out: { text: string; font: FontKey }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    let f: FontKey | undefined;
    if (cp === 0x20 || has(font, cp)) f = font;
    else if (has('sans', cp)) f = 'sans';
    if (!f) continue;
    const last = out[out.length - 1];
    if (last?.font === f) last.text += ch;
    else out.push({ text: ch, font: f });
  }
  return out;
}

export interface Measurer { width(text: string, font: FontKey, size: number): number; has: HasGlyph }

interface FontkitFont { hasGlyphForCodePoint(cp: number): boolean }
interface DocInternals { _font: { font: FontkitFont } }

export function pdfMeasurer(doc: PDFKit.PDFDocument): Measurer {
  const cache = new Map<string, boolean>();
  return {
    width: (text, font, size) => doc.font(font).fontSize(size).widthOfString(text),
    has: (font, cp) => {
      const key = `${font}:${cp}`;
      let v = cache.get(key);
      if (v === undefined) {
        doc.font(font);
        v = (doc as unknown as DocInternals)._font.font.hasGlyphForCodePoint(cp);
        cache.set(key, v);
      }
      return v;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// line layout

interface Piece { text: string; font: FontKey; size: number; color: string; x: number }
/** A run fragment of a line, with the paragraph's flags but without separators, bullet or paragraphEnd. */
type Fragment = Omit<TextRun, 'paragraphEnd' | 'bullet'>;
interface Line {
  pieces: Piece[];
  fragments: Fragment[];
  height: number;
  size: number; // largest font size
  end: 'soft' | 'hard' | 'para';
  paraStart: boolean;
  bullet?: string; // drawn left of the first line of a list item
  heading: boolean;
  gapAfter: number;
}

interface Token { kind: 'word' | 'space' | 'break'; text: string; run: TextRun }

function tokensOf(runs: TextRun[]): Token[] {
  const out: Token[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\n| +)/)) {
      if (part === '') continue;
      if (part === '\n') out.push({ kind: 'break', text: '', run });
      else if (part.startsWith(' ')) out.push({ kind: 'space', text: ' ', run });
      else out.push({ kind: 'word', text: part, run });
    }
  }
  return out;
}

const fragmentOf = (run: TextRun, text: string): Fragment => {
  const f: Fragment = { text };
  if (run.bold) f.bold = true;
  if (run.italic) f.italic = true;
  if (run.heading) f.heading = true;
  if (run.list) f.list = true;
  if (run.cls) f.cls = run.cls;
  return f;
};
const sameStyle = (a: Fragment, b: Fragment) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.heading === !!b.heading && !!a.list === !!b.list && a.cls === b.cls;

function paragraphsOf(runs: TextRun[]): TextRun[][] {
  const paras: TextRun[][] = [];
  let cur: TextRun[] = [];
  for (const r of runs) {
    cur.push(r);
    if (r.paragraphEnd) {
      paras.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) paras.push(cur);
  return paras;
}

/** Breaks runs into lines of at most `width` pt (a word longer than the line is split by characters). */
export function layoutRuns(runs: TextRun[], style: TextStyle, width: number, m: Measurer): Line[] {
  const st = STYLES[style];
  const lines: Line[] = [];
  for (const para of paragraphsOf(runs)) {
    const first = para[0];
    const indent = first.list ? st.size * BOOK_LIST_INDENT_EM : 0;
    const avail = Math.max(1, width - indent);
    let pieces: Piece[] = [];
    let fragments: Fragment[] = [];
    let x = 0;
    let pendingSpace: Token | undefined;
    let paraStart = true;
    let maxSize = runSize(first, st);

    const pushFragment = (run: TextRun, text: string) => {
      const last = fragments[fragments.length - 1];
      const f = fragmentOf(run, text);
      if (last && sameStyle(last, f)) last.text += text;
      else fragments.push(f);
    };
    const finish = (end: Line['end']) => {
      if (fragments.length === 0) fragments.push(fragmentOf(first, ''));
      lines.push({
        pieces, fragments, size: maxSize, height: maxSize * st.leading, end, paraStart,
        bullet: paraStart && first.list && first.bullet ? first.bullet : undefined,
        heading: !!first.heading, gapAfter: end === 'para' ? st.gap : 0,
      });
      pieces = [];
      fragments = [];
      x = 0;
      pendingSpace = undefined;
      paraStart = false;
      maxSize = runSize(first, st);
    };
    const place = (run: TextRun, text: string) => {
      const size = runSize(run, st);
      for (const seg of glyphSegments(text, runFont(run, st.font), m.has)) {
        pieces.push({ text: seg.text, font: seg.font, size, color: runColor(run, st), x });
        x += m.width(seg.text, seg.font, size);
      }
      pushFragment(run, text);
      maxSize = Math.max(maxSize, size);
    };
    const widthOf = (run: TextRun, text: string) => {
      const size = runSize(run, st);
      return glyphSegments(text, runFont(run, st.font), m.has).reduce((w, s) => w + m.width(s.text, s.font, size), 0);
    };

    for (const t of tokensOf(para)) {
      if (t.kind === 'break') {
        finish('hard');
        continue;
      }
      if (t.kind === 'space') {
        if (pieces.length > 0) pendingSpace = t;
        continue;
      }
      const w = widthOf(t.run, t.text);
      const spaceW = pendingSpace ? widthOf(pendingSpace.run, ' ') : 0;
      if (pieces.length > 0 && x + spaceW + w > avail) finish('soft');
      else if (pendingSpace) place(pendingSpace.run, ' ');
      pendingSpace = undefined;
      if (w <= avail) {
        place(t.run, t.text);
        continue;
      }
      // a word wider than the line: split by characters
      let part = '';
      for (const ch of t.text) {
        if (part !== '' && x + widthOf(t.run, part + ch) > avail) {
          place(t.run, part);
          finish('soft');
          part = '';
        }
        part += ch;
      }
      if (part !== '') place(t.run, part);
    }
    finish(para[para.length - 1].paragraphEnd ? 'para' : 'soft');
  }
  return lines;
}

/** The runs of a sequence of lines (soft breaks become spaces again), for a page chunk or the text still to place. */
function linesToRuns(lines: Line[]): TextRun[] {
  const out: TextRun[] = [];
  lines.forEach((line, i) => {
    const frags: TextRun[] = line.fragments.map((f) => ({ ...f }));
    if (line.paraStart && line.bullet) frags[0].bullet = line.bullet;
    else if (i === 0 && !line.paraStart && line.fragments[0]?.list) frags[0].bullet = ''; // continued list item
    const last = frags[frags.length - 1];
    if (line.end === 'hard') last.text += '\n';
    else if (line.end === 'soft' && i < lines.length - 1) last.text += ' ';
    else if (line.end === 'para') last.paragraphEnd = true;
    for (const f of frags) {
      const prev = out[out.length - 1];
      if (prev && !prev.paragraphEnd && f.bullet === undefined && sameStyle(prev, f)) prev.text += f.text;
      else out.push(f);
      if (f.paragraphEnd) out[out.length - 1].paragraphEnd = true;
    }
  });
  const tail = out[out.length - 1];
  if (tail && !tail.paragraphEnd) tail.paragraphEnd = true;
  return out;
}

/** How many lines fit into `height` pt (at least one, a heading is not left alone at the bottom). */
function fitCount(lines: Line[], height: number): number {
  let y = 0;
  let n = 0;
  while (n < lines.length && y + lines[n].height <= height + 0.01) {
    y += lines[n].height + lines[n].gapAfter;
    n++;
  }
  while (n > 1 && n < lines.length && lines[n - 1].heading) n--;
  return Math.max(1, n);
}

/** The PaginateText of layoutBook, measuring with the document's fonts — authoritative for the page count. */
export function pdfkitPaginate(doc: PDFKit.PDFDocument): PaginateText {
  const m = pdfMeasurer(doc);
  return (html: string, style: TextStyle, first: Box, next: Box): string[] => {
    let runs = htmlToRuns(html);
    if (runs.every((r) => r.text.trim() === '')) return [];
    const chunks: string[] = [];
    let box = first;
    while (runs.length > 0) {
      const lines = layoutRuns(runs, style, mmToPt(box.w), m);
      const n = fitCount(lines, mmToPt(box.h));
      chunks.push(runsToHtml(linesToRuns(lines.slice(0, n))));
      runs = n < lines.length ? linesToRuns(lines.slice(n)) : [];
      box = next;
    }
    return chunks;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// drawing

export interface BookPdfContext {
  bleedMm: number;
  x4: boolean;
  /** The photo's JPEG; undefined = not available, the frame stays black. */
  image: (imageKey: string) => Promise<Buffer | undefined>;
  mapImage: (file: string) => Promise<Buffer | undefined>;
}

interface X4State { srgb: PDFKit.PDFKitReference }
const X4 = new WeakMap<PDFKit.PDFDocument, X4State>();

interface PdfImage { width: number; height: number; orientation?: number; colorSpace: unknown }

function drawTextFrame(doc: PDFKit.PDFDocument, frame: Extract<BookFrame, { kind: 'text' }>, ox: number, oy: number, m: Measurer): void {
  const runs = htmlToRuns(frame.html);
  const x0 = mmToPt(frame.box.x) + ox;
  const y0 = mmToPt(frame.box.y) + oy;
  const w = mmToPt(frame.box.w);
  const h = mmToPt(frame.box.h);
  const rotated = frame.rotate === 90;
  const st = STYLES[frame.style];
  let lines = layoutRuns(runs, frame.style, rotated ? h : w, m);
  doc.save();
  // nothing is drawn outside the frame, as in the preview (.frame overflow hidden): e.g. a long footprint title
  doc.rect(x0, y0, w, h).clip();
  if (rotated) {
    // the spine: the title runs top to bottom, centred across the spine, scaled down to 80 % of its width
    const height = (ls: Line[]) => ls.reduce((s, l) => s + l.height, 0);
    const scale = Math.min(1, (w * 0.8) / Math.max(1, height(lines)));
    if (scale < 1) lines = layoutRuns(runs, frame.style, h / scale, m);
    doc.translate(x0 + w - (w - height(lines) * scale) / 2, y0).rotate(90).scale(scale);
  } else doc.translate(x0, y0);
  const indent = st.size * BOOK_LIST_INDENT_EM;
  let y = 0;
  for (const line of lines) {
    const baseline = y + line.height / 2 + line.size * 0.35;
    const left = line.fragments[0]?.list ? indent : 0;
    if (line.bullet) doc.font(st.font).fontSize(st.size).fillColor(st.color).text(line.bullet, 0, baseline, { lineBreak: false, baseline: 'alphabetic' });
    for (const p of line.pieces) {
      if (p.text.trim() === '') continue;
      doc.font(p.font).fontSize(p.size).fillColor(p.color).text(p.text, left + p.x, baseline, { lineBreak: false, baseline: 'alphabetic' });
    }
    y += line.height + line.gapAfter;
  }
  doc.restore();
}

function drawImage(doc: PDFKit.PDFDocument, data: Buffer, box: { x: number; y: number; w: number; h: number }, fit: 'fill' | 'whole', srgb?: PDFKit.PDFKitReference): boolean {
  let img: PdfImage;
  try {
    img = (doc as unknown as { openImage(src: Buffer): PdfImage }).openImage(data);
  } catch {
    return false;
  }
  // a sRGB-tagged photo (ICCBased) instead of device RGB: device-independent, as PDF/X-4 allows
  if (srgb && img.colorSpace === 'DeviceRGB') img.colorSpace = ['ICCBased', srgb];
  let iw = img.width;
  let ih = img.height;
  if ((img.orientation ?? 1) > 4) [iw, ih] = [ih, iw];
  const s = fit === 'fill' ? Math.max(box.w / iw, box.h / ih) : Math.min(box.w / iw, box.h / ih);
  const w = iw * s;
  const h = ih * s;
  doc.save();
  doc.rect(box.x, box.y, box.w, box.h).clip();
  doc.image(img as unknown as Buffer, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, { width: w, height: h });
  doc.restore();
  return true;
}

const RELIEVE_HIGH = 32 * 1024 * 1024;
const RELIEVE_MAX_MS = 10 * 60 * 1000;

/**
 * Waits while more than `high` bytes of PDF sit unread in the document stream, so photos do not pile up in memory
 * when the bucket upload is slower. Under backpressure pipe() pauses the source (readableFlowing false), so the wait
 * depends on the buffered length alone. Throws once the stream is destroyed (the upload failed) — the export stops
 * instead of reading every further photo — or when nothing is consumed for ten minutes.
 */
export async function relieve(stream: Readable, high = RELIEVE_HIGH, pollMs = 20): Promise<void> {
  const until = Date.now() + RELIEVE_MAX_MS;
  for (;;) {
    if (stream.destroyed) throw new Error('book pdf: the output stream is closed');
    if (stream.readableLength <= high) return;
    if (Date.now() > until) throw new Error('book pdf: the upload stopped consuming');
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

const streamOf = (doc: PDFKit.PDFDocument) => doc as unknown as Readable;

async function drawFrames(doc: PDFKit.PDFDocument, frames: BookFrame[], ox: number, oy: number, ctx: BookPdfContext, m: Measurer): Promise<void> {
  const srgb = ctx.x4 ? X4.get(doc)?.srgb : undefined;
  if (ctx.x4 && !srgb) throw new Error('writeBookPdf: x4 needs applyPdfX4 first');
  // photos and maps first, text on top
  for (const f of frames) {
    if (f.kind === 'text') continue;
    const box = { x: mmToPt(f.box.x) + ox, y: mmToPt(f.box.y) + oy, w: mmToPt(f.box.w), h: mmToPt(f.box.h) };
    const data = f.kind === 'photo' ? await ctx.image(f.imageKey) : await ctx.mapImage(f.file);
    if (data) drawImage(doc, data, box, f.kind === 'photo' ? f.fit : 'fill', srgb);
  }
  for (const f of frames) if (f.kind === 'text') drawTextFrame(doc, f, ox, oy, m);
}

function blackPage(doc: PDFKit.PDFDocument, wPt: number, hPt: number): void {
  doc.addPage({ size: [wPt, hPt], margin: 0 });
  doc.rect(0, 0, wPt, hPt).fill('#000000');
}

/**
 * The book pages: MediaBox = trim + 2 × bleed, black over the whole MediaBox, frames shifted by the bleed (their
 * origin is the trim box). One photo at a time; `onPage` after each page.
 */
export async function writeBookPdf(doc: PDFKit.PDFDocument, pages: BookPage[], ctx: BookPdfContext, onPage?: (i: number) => void | Promise<void>): Promise<void> {
  const m = pdfMeasurer(doc);
  const bleed = mmToPt(ctx.bleedMm);
  const wPt = mmToPt(PAGE_W_MM + 2 * ctx.bleedMm);
  const hPt = mmToPt(PAGE_H_MM + 2 * ctx.bleedMm);
  for (let i = 0; i < pages.length; i++) {
    await relieve(streamOf(doc)); // also stops a failed upload before the next page's photos are read
    blackPage(doc, wPt, hPt);
    await drawFrames(doc, pages[i].frames, bleed, bleed, ctx, m);
    await onPage?.(i);
  }
  await relieve(streamOf(doc));
}

/** The cover sheet of coverLayout (one page, frames from the sheet's top-left corner, bleed included). */
export async function writeCoverPdf(doc: PDFKit.PDFDocument, cover: { width: number; height: number; frames: BookFrame[] }, ctx: BookPdfContext): Promise<void> {
  await relieve(streamOf(doc));
  blackPage(doc, mmToPt(cover.width), mmToPt(cover.height));
  await drawFrames(doc, cover.frames, 0, 0, ctx, pdfMeasurer(doc));
}

// ---------------------------------------------------------------------------------------------------------------
// PDF/X-4

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmpDate = (d: Date) => `${d.toISOString().split('.')[0]}Z`;

interface DocX4Internals { _root: { data: Record<string, unknown> }; info: { CreationDate: Date }; page: { width: number; height: number; dictionary: { data: Record<string, unknown> }; resources: { data: Record<string, unknown> } } }

/**
 * Makes the document PDF/X-4 (design §7 checklist). Call right after creating the document (before the first page;
 * the document must be PDF 1.6): output intent GTS_PDFX with the FOGRA39 profile embedded, the X-4 XMP keys, Info
 * /Trapped /False and /Title, on every page BleedBox = MediaBox and TrimBox = MediaBox less the bleed (a page that is
 * not trim + 2 × bleed throws), DefaultRGB = sRGB, and the photos tagged sRGB (writeBookPdf, x4).
 */
export function applyPdfX4(doc: PDFKit.PDFDocument, meta: { title: string; iccFogra: Buffer; trim: { w: number; h: number }; bleedMm: number; iccSrgb?: Buffer }): void {
  const d = doc as unknown as DocX4Internals & PDFKit.PDFDocument;
  const profile = (data: Buffer, n: number) => {
    const ref = doc.ref({ N: n });
    ref.end(data);
    return ref;
  };
  const fogra = profile(meta.iccFogra, 4);
  const srgb = profile(meta.iccSrgb ?? bookAsset('sRGB.icc'), 3);
  X4.set(doc, { srgb });
  const intent = doc.ref({
    Type: 'OutputIntent',
    S: 'GTS_PDFX',
    OutputConditionIdentifier: new String('FOGRA39'),
    OutputCondition: new String('Offset printing, ISO 12647-2:2004/Amd 1, coated paper, FOGRA39'),
    RegistryName: new String('http://www.color.org'),
    Info: new String('ISO Coated v2 (ECI)'),
    DestOutputProfile: fogra,
  });
  intent.end(undefined);
  d._root.data['OutputIntents'] = [intent];

  // Info: pdfkit writes every doc.info value as an indirect string; /Trapped must be the name /False, so the entries
  // go straight into the Info dictionary when pdfkit creates it in end().
  const created = d.info.CreationDate;
  let info: { data: Record<string, unknown> } | undefined;
  Object.defineProperty(doc, '_info', {
    configurable: true,
    get: () => info,
    set: (v: { data: Record<string, unknown> }) => {
      info = v;
      v.data['Trapped'] = 'False'; // a JS string is written as a PDF name
      v.data['Title'] = new String(meta.title);
      v.data['ModDate'] = created;
    },
  });
  const id = `uuid:${randomUUID()}`;
  doc.appendXML(`
        <rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
            <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
            <pdf:Trapped>False</pdf:Trapped>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
            <xmp:ModifyDate>${xmpDate(created)}</xmp:ModifyDate>
            <xmp:MetadataDate>${xmpDate(created)}</xmp:MetadataDate>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:format>application/pdf</dc:format>
            <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(meta.title)}</rdf:li></rdf:Alt></dc:title>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
            <xmpMM:DocumentID>${id}</xmpMM:DocumentID>
            <xmpMM:InstanceID>${id}</xmpMM:InstanceID>
            <xmpMM:VersionID>1</xmpMM:VersionID>
            <xmpMM:RenditionClass>default</xmpMM:RenditionClass>
        </rdf:Description>`);

  const bleed = mmToPt(meta.bleedMm);
  const wantW = mmToPt(meta.trim.w + 2 * meta.bleedMm);
  const wantH = mmToPt(meta.trim.h + 2 * meta.bleedMm);
  doc.on('pageAdded', () => {
    const page = d.page;
    if (Math.abs(page.width - wantW) > 0.5 || Math.abs(page.height - wantH) > 0.5) {
      throw new Error(`applyPdfX4: page ${page.width} × ${page.height} pt is not trim + bleed (${wantW} × ${wantH} pt)`);
    }
    page.dictionary.data['BleedBox'] = [0, 0, page.width, page.height];
    page.dictionary.data['TrimBox'] = [bleed, bleed, page.width - bleed, page.height - bleed];
    const cs = (page.resources.data['ColorSpace'] ?? {}) as Record<string, unknown>;
    page.resources.data['ColorSpace'] = { ...cs, DefaultRGB: ['ICCBased', srgb] };
  });
}
