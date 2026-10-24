/*
 * The text frames of the travel book (design 2026-10-24 §7 «Text»): the HTML that layoutBook puts into a text frame
 * (the author's editor HTML plus the util's own `book-*` classes) as styled runs, and back. Paragraphs, headings,
 * bold, italic, lists and line breaks are kept; every other tag is dropped and its text kept as plain text.
 *
 * No emoji stripping here (ruling R5): the util has already stripped every user string, and «♥» (U+2665) of the
 * like line is the util's own and must survive. Code points the print fonts cannot draw are dropped by the PDF writer
 * (book-pdf.ts `glyphSegments`), not here.
 */

/** Inline or paragraph classes the util emits (journal-book.util.ts): `book-number`, `book-author`, `book-likes`. */
export type RunClass = 'number' | 'author' | 'likes';

export interface TextRun {
  text: string; // '\n' = hard line break
  bold?: boolean;
  italic?: boolean;
  heading?: boolean; // h1–h6 or `book-heading`, on every run of the paragraph
  list?: boolean; // inside a list item, on every run of the paragraph
  bullet?: string; // first run of a list item: '•' or '3.'; '' = continued item (no bullet)
  cls?: RunClass;
  paragraphEnd?: boolean; // last run of its paragraph
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BLOCK = new Set(['p', 'div', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre']);
const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs)?.slice(2).find((v) => v !== undefined);
const classOf = (attrs: string): string[] => (attr(attrs, 'class') ?? '').split(/\s+/).filter((c) => c);

interface Frame { tag: string; bold?: boolean; italic?: boolean; heading?: boolean; cls?: RunClass }
interface ListFrame { ordered: boolean; counter: number }

/** The runs of a text frame's HTML. Whitespace is collapsed as a browser would; empty paragraphs are kept. */
export function htmlToRuns(html: string): TextRun[] {
  const runs: TextRun[] = [];
  const stack: Frame[] = [];
  const lists: ListFrame[] = [];
  let para: { heading?: boolean; list?: boolean; bullet?: string; cls?: RunClass } | undefined;
  let paraRuns: TextRun[] = [];

  const flags = () => ({
    bold: stack.some((f) => f.bold) || undefined,
    italic: stack.some((f) => f.italic) || undefined,
    cls: [...stack].reverse().find((f) => f.cls)?.cls,
  });
  const open = (p: typeof para) => {
    close();
    para = p ?? {};
  };
  const close = () => {
    if (!para) return;
    // trim the paragraph's outer whitespace, keep hard breaks
    if (paraRuns.length > 0) {
      paraRuns[0].text = paraRuns[0].text.replace(/^ +/, '');
      const last = paraRuns[paraRuns.length - 1];
      last.text = last.text.replace(/ +$/, '');
    }
    paraRuns = paraRuns.filter((r, i) => r.text !== '' || (i === 0 && paraRuns.every((x) => x.text === '')));
    if (paraRuns.length === 0) paraRuns = [{ text: '' }];
    const p = para;
    paraRuns.forEach((r, i) => {
      if (p.heading) r.heading = true;
      if (p.list) r.list = true;
      if (p.cls && !r.cls) r.cls = p.cls;
      if (i === 0 && p.bullet !== undefined) r.bullet = p.bullet;
      if (!r.bold) delete r.bold;
      if (!r.italic) delete r.italic;
      if (!r.cls) delete r.cls;
    });
    paraRuns[paraRuns.length - 1].paragraphEnd = true;
    runs.push(...paraRuns);
    paraRuns = [];
    para = undefined;
  };
  const addText = (text: string) => {
    if (text === '') return;
    if (!para) {
      if (text.trim() === '') return; // whitespace between blocks
      open({});
    }
    const prev = paraRuns[paraRuns.length - 1];
    const f = flags();
    // collapse a space at a run boundary
    if (text.startsWith(' ') && (paraRuns.length === 0 || (prev && /[ \n]$/.test(prev.text)))) text = text.slice(1);
    if (text === '') return;
    if (prev && prev.bold === f.bold && prev.italic === f.italic && prev.cls === f.cls) prev.text += text;
    else paraRuns.push({ text, bold: f.bold, italic: f.italic, cls: f.cls });
  };

  const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html)) !== null) {
    if (m[4] !== undefined || m[0] === '<') {
      addText(decodeEntities((m[4] ?? '<').replace(/\s+/g, ' ')));
      continue;
    }
    if (m[2] === undefined) continue; // comment
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (tag === 'br') {
      if (!para) open({});
      const prev = paraRuns[paraRuns.length - 1];
      if (prev) prev.text = prev.text.replace(/ +$/, '');
      const f = flags();
      if (prev && prev.bold === f.bold && prev.italic === f.italic && prev.cls === f.cls) prev.text += '\n';
      else paraRuns.push({ text: '\n', bold: f.bold, italic: f.italic, cls: f.cls });
      continue;
    }
    if (tag === 'script' || tag === 'style') {
      if (!closing) {
        const end = html.toLowerCase().indexOf(`</${tag}`, TOKEN.lastIndex);
        TOKEN.lastIndex = end < 0 ? html.length : end;
      }
      continue;
    }
    if (closing) {
      if (tag === 'ul' || tag === 'ol') {
        close();
        lists.pop();
      } else if (BLOCK.has(tag)) close();
      const i = stack.map((f) => f.tag).lastIndexOf(tag);
      if (i >= 0) stack.splice(i);
      continue;
    }
    if (attrs.trim().endsWith('/')) continue; // self-closing inline (img, hr)
    const classes = classOf(attrs);
    if (tag === 'ul' || tag === 'ol') {
      close();
      const start = parseInt(attr(attrs, 'start') ?? '1', 10);
      lists.push({ ordered: tag === 'ol', counter: Number.isFinite(start) ? start : 1 });
      continue;
    }
    if (tag === 'li') {
      const list = lists[lists.length - 1];
      let bullet = attr(attrs, 'data-bullet');
      if (classes.includes('book-cont')) bullet = '';
      if (bullet === undefined) bullet = list?.ordered ? `${list.counter}.` : '•';
      if (list?.ordered && !classes.includes('book-cont')) list.counter++;
      open({ list: true, bullet });
      stack.push({ tag });
      continue;
    }
    if (BLOCK.has(tag)) {
      const heading = /^h[1-6]$/.test(tag) || classes.includes('book-heading');
      const cls: RunClass | undefined = classes.includes('book-author') ? 'author' : classes.includes('book-likes') ? 'likes' : undefined;
      const inItem = stack.some((f) => f.tag === 'li');
      if (tag === 'div' || tag === 'blockquote' || tag === 'pre') {
        // a wrapper: its text forms a paragraph, nested blocks their own
        close();
      } else if (inItem && para?.list && paraRuns.length === 0) {
        // <li><p>…</p></li> (the editor's list markup): the item's own paragraph
      } else if (inItem) open({ list: true, bullet: '' }); // a further paragraph of the same item
      else open({ heading: heading || undefined, cls });
      stack.push({ tag });
      continue;
    }
    stack.push({
      tag,
      bold: tag === 'b' || tag === 'strong' || undefined,
      italic: tag === 'i' || tag === 'em' || undefined,
      cls: classes.includes('book-number') ? 'number' : undefined,
    });
  }
  close();
  return runs;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML for runs, read back by htmlToRuns to the same runs (used for the page chunks of pdfkitPaginate). */
export function runsToHtml(runs: TextRun[]): string {
  let html = '';
  let paragraph: TextRun[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const first = paragraph[0];
    const body = paragraph.map((r) => {
      let t = esc(r.text).replace(/\n/g, '<br>');
      if (r.bold) t = `<b>${t}</b>`;
      if (r.italic) t = `<i>${t}</i>`;
      if (r.cls === 'number') t = `<span class="book-number">${t}</span>`;
      return t;
    }).join('');
    const cls = first.heading ? 'book-heading' : first.cls === 'author' ? 'book-author' : first.cls === 'likes' ? 'book-likes' : '';
    if (first.list) {
      const b = first.bullet ?? '';
      html += b === '' ? `<ul><li class="book-cont">${body}</li></ul>` : `<ul><li data-bullet="${esc(b)}">${body}</li></ul>`;
    } else html += cls ? `<p class="${cls}">${body}</p>` : `<p>${body}</p>`;
    paragraph = [];
  };
  for (const r of runs) {
    // paragraph-level classes are carried by the <p>, not repeated per run
    const own: TextRun = { ...r, cls: r.cls === 'number' ? 'number' : undefined };
    paragraph.push(paragraph.length === 0 ? { ...r } : own);
    if (r.paragraphEnd) flush();
  }
  flush();
  return html;
}
