import { Box, PaginateText, TextStyle } from '@okr/travel-journal-util';
import { bookTextClass, ensureBookStyles } from '@okr/travel-journal-ui';

/**
 * The preview's PaginateText (layoutBook): the text is set in a hidden box with the print fonts, the PDF's sizes and
 * line heights (shared CSS, journal-book-styles.ts) and the frame's width in mm; the first word whose line ends below
 * the frame starts the next chunk. Chunks are cut with a DOM Range, so bold, italic, lists and links stay intact
 * across the cut; a list item continued on the next page gets `book-cont` (no second bullet), and a heading is not
 * left alone at the bottom. The PDF function measures again with pdfkit and is authoritative — the preview is an
 * estimate with the same fonts and boxes, so it agrees except for rare line-break differences.
 *
 * `sanitize` must remove scripts and event handlers: the HTML is written into the live document to be measured.
 * Results are cached per text, style and boxes.
 */
const MAX_CHUNKS = 400;
const PX_PER_MM = 96 / 25.4;
const HEADING = 'h1,h2,h3,h4,h5,h6,.book-heading';

export function domPaginate(sanitize: (html: string) => string): PaginateText {
  const cache = new Map<string, string[]>();
  let host: HTMLDivElement | undefined;
  const box = (): HTMLDivElement => {
    if (!host || !host.isConnected) {
      ensureBookStyles();
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;';
      document.body.appendChild(host);
    }
    return host;
  };
  return (html: string, style: TextStyle, first: Box, next: Box): string[] => {
    const key = `${style}|${first.w}x${first.h}|${next.w}x${next.h}|${html}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const chunks = typeof document === 'undefined' ? [html] : paginate(box(), sanitize(html), style, first, next);
    cache.set(key, chunks);
    return chunks;
  };
}

function paginate(el: HTMLDivElement, html: string, style: TextStyle, first: Box, next: Box): string[] {
  el.className = bookTextClass(style);
  let rest = html;
  let frame = first;
  const chunks: string[] = [];
  while (chunks.length < MAX_CHUNKS) {
    el.style.width = `${frame.w}mm`;
    el.innerHTML = rest;
    if (!(el.textContent ?? '').trim()) break;
    // fit is decided by the lines alone: the box's height would also count the last paragraph's bottom margin
    const limit = el.getBoundingClientRect().top + frame.h * PX_PER_MM;
    const cut = breakPoint(el, limit);
    if (!cut) {
      chunks.push(rest);
      break;
    }
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(cut.node, cut.offset);
    const head = serialize(range.cloneContents());
    range.setStart(cut.node, cut.offset);
    range.setEnd(el, el.childNodes.length);
    const tail = range.cloneContents();
    if (cut.node.parentElement?.closest('li')) tail.querySelector('li')?.classList.add('book-cont');
    trimLeading(tail);
    chunks.push(head);
    rest = serialize(tail);
    frame = next;
  }
  el.innerHTML = '';
  return chunks;
}

interface Cut { node: Text; offset: number }

/** Bottom of the line box that holds the given range's last character. */
function lineBottom(range: Range, lineHeight: number): number {
  const rects = range.getClientRects();
  const r = rects[rects.length - 1];
  if (!r) return -Infinity;
  return r.top + r.height / 2 + lineHeight / 2;
}

function lineHeightOf(node: Text): number {
  const parent = node.parentElement;
  if (!parent) return 0;
  const lh = parseFloat(getComputedStyle(parent).lineHeight);
  return Number.isFinite(lh) ? lh : parseFloat(getComputedStyle(parent).fontSize) * 1.4;
}

/**
 * The position of the first word whose line ends below `limit`. Never the very start of the text (at least one word
 * per chunk); moved before a heading that would otherwise end the chunk.
 */
function breakPoint(el: HTMLElement, limit: number): Cut | undefined {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let firstText = true;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const words = [...node.data.matchAll(/\S+/g)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
    if (words.length === 0) continue;
    const lh = lineHeightOf(node);
    const bottomOf = (i: number) => {
      range.setStart(node, words[i].start);
      range.setEnd(node, words[i].end);
      return lineBottom(range, lh);
    };
    if (bottomOf(words.length - 1) <= limit + 0.5) {
      firstText = false;
      continue;
    }
    // binary search: the first word below the limit
    let lo = 0;
    let hi = words.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bottomOf(mid) > limit + 0.5) hi = mid;
      else lo = mid + 1;
    }
    if (lo === 0 && firstText) {
      // not even the first word fits: take the first line anyway
      const firstBottom = bottomOf(0);
      let i = 1;
      while (i < words.length && bottomOf(i) <= firstBottom + 0.5) i++;
      return i < words.length ? { node, offset: words[i].start } : nextTextStart(walker);
    }
    return beforeHeading(el, { node, offset: words[lo].start });
  }
  return undefined;
}

function nextTextStart(walker: TreeWalker): Cut | undefined {
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const m = /\S/.exec(node.data);
    if (m) return { node, offset: m.index };
  }
  return undefined;
}

/** A cut at the very start of a block right after a heading moves before that heading, if text stays before it. */
function beforeHeading(el: HTMLElement, cut: Cut): Cut {
  const block = cut.node.parentElement?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,div');
  if (!block || block === el || cut.offset !== (/\S/.exec(cut.node.data)?.index ?? 0)) return cut;
  const prev = block.previousElementSibling;
  if (!prev || !prev.matches(HEADING)) return cut;
  const walker = document.createTreeWalker(prev, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode() as Text | null;
  if (!text || !prev.previousElementSibling) return cut; // the heading opens the chunk: keep it, or nothing would fit
  return { node: text, offset: 0 };
}

/** Drops whitespace at the start of the continued text (the cut sits at a word, the space before it stays behind). */
function trimLeading(fragment: DocumentFragment): void {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode() as Text | null;
  if (node) node.data = node.data.replace(/^\s+/, '');
}

function serialize(fragment: DocumentFragment): string {
  const div = document.createElement('div');
  div.appendChild(fragment);
  // empty elements left over at the edges of a cut (an empty <p> or <li>) are dropped
  div.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6').forEach((e) => { if (!(e.textContent ?? '').trim() && !e.querySelector('br,img')) e.remove(); });
  div.querySelectorAll('ul,ol').forEach((e) => { if (!e.querySelector('li')) e.remove(); });
  return div.innerHTML;
}
