/*
 * The rich-text schema (spec 1.170 §4.3). A port of ngx-editor 18's schema
 * (https://github.com/sibiraj-s/ngx-editor, MIT License, Copyright (c) Sibiraj S) — same node and mark
 * names, same parseDOM and toDOM — so HTML stored by the old editor parses and serialises back
 * unchanged. Keep it that way: every mark and attribute here must still parse even if the toolbar
 * stops offering it, or the next save silently deletes it from the stored text.
 */
import { DOMOutputSpec, MarkSpec, Node as PMNode, NodeSpec, Schema } from 'prosemirror-model';
import { bulletList as slBulletList, listItem as slListItem, orderedList as slOrderedList } from 'prosemirror-schema-list';

/** `{ textAlign: 'center', marginLeft: null }` → `text-align:center` (empty values dropped). */
export function toStyleString(styles: Record<string, string | null>): string {
  return Object.entries(styles)
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`)
    .join(';');
}

// every text-align keyword; pasted texts carry 'start' (79 stored blocks, 2026-11-22)
const ALIGNS = new Set(['left', 'center', 'right', 'justify', 'start', 'end', 'match-parent', 'justify-all']);
/**
 * Values that end up inside a style attribute are checked on the way in and on the way out: a stored
 * `align="center;background:url(…)"` or `color:red;position:fixed` must not ride along into the DOM.
 */
export function safeAlign(value: unknown): string | null {
  const align = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALIGNS.has(align) ? align : null;
}
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i;
export function safeColor(value: unknown): string | null {
  const color = typeof value === 'string' ? value.trim() : '';
  return COLOR.test(color) ? color : null;
}
function safeIndent(value: unknown): number | null {
  const indent = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isInteger(indent) && indent > 0 && indent <= 20 ? indent : null;
}

function blockAttrs(dom: HTMLElement): { align: string | null; indent: number | null } {
  const align = safeAlign(dom.getAttribute('align') || dom.style.textAlign);
  return { align, indent: safeIndent(dom.getAttribute('data-indent')) };
}

function blockDOM(tag: string, node: PMNode): DOMOutputSpec {
  const align = safeAlign(node.attrs['align']);
  const indent = safeIndent(node.attrs['indent']);
  const style = toStyleString({
    textAlign: align !== 'left' ? align : null,
    marginLeft: indent !== null ? `${indent * 40}px` : null,
  }) || null;
  return [tag, { style, 'data-indent': indent ?? null }, 0];
}

// ---------------------------------------------------------------- marks

const link: MarkSpec = {
  attrs: { href: {}, title: { default: null }, target: { default: '_blank' } },
  inclusive: false,
  parseDOM: [{
    tag: 'a[href]',
    getAttrs: (dom) => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title'), target: dom.getAttribute('target') }),
  }],
  toDOM: (mark) => {
    const { href, title, target } = mark.attrs;
    return ['a', { href, title, target }, 0];
  },
};

const em: MarkSpec = {
  parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
  toDOM: () => ['em', 0],
};

const strong: MarkSpec = {
  parseDOM: [
    { tag: 'strong' },
    // Google Docs wraps pasted content in <b style="font-weight:normal">
    { tag: 'b', getAttrs: (dom) => dom.style.fontWeight !== 'normal' && null },
    { style: 'font-weight', getAttrs: (value) => /^(?:bold(?:er)?|[5-9]\d{2,})$/.test(value) && null },
  ],
  toDOM: () => ['strong', 0],
};

const code: MarkSpec = {
  parseDOM: [{ tag: 'code' }],
  toDOM: () => ['code', 0],
};

const u: MarkSpec = {
  parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline', consuming: false }],
  toDOM: () => ['u', 0],
};

const s: MarkSpec = {
  parseDOM: [{ tag: 's' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
  toDOM: () => ['s', 0],
};

const textColor: MarkSpec = {
  attrs: { color: { default: null } },
  parseDOM: [{ style: 'color', getAttrs: (value) => { const color = safeColor(value); return color ? { color } : false; } }],
  toDOM: (mark) => { const color = safeColor(mark.attrs['color']); return ['span', color ? { style: `color:${color};` } : {}, 0]; },
};

const textBackgroundColor: MarkSpec = {
  attrs: { backgroundColor: { default: null } },
  parseDOM: [{
    style: 'background-color',
    getAttrs: (value) => { const backgroundColor = safeColor(value); return backgroundColor ? { backgroundColor } : false; },
  }],
  toDOM: (mark) => {
    const backgroundColor = safeColor(mark.attrs['backgroundColor']);
    return ['span', backgroundColor ? { style: `background-color:${backgroundColor};` } : {}, 0];
  },
};

const sup: MarkSpec = {
  parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
  toDOM: () => ['sup', 0],
};

const sub: MarkSpec = {
  parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
  toDOM: () => ['sub', 0],
};

// ---------------------------------------------------------------- nodes

const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: { align: { default: null }, indent: { default: null } },
  parseDOM: [{ tag: 'p', getAttrs: (dom) => blockAttrs(dom) }],
  toDOM: (node) => blockDOM('p', node),
};

const blockquote: NodeSpec = {
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: { indent: { default: null } },
  parseDOM: [{ tag: 'blockquote', getAttrs: (dom) => ({ indent: blockAttrs(dom).indent }) }],
  toDOM: (node) => {
    const indent = safeIndent(node.attrs['indent']);
    const style = toStyleString({ marginLeft: indent !== null ? `${indent * 40}px` : null }) || null;
    return ['blockquote', { style, 'data-indent': indent ?? null }, 0];
  },
};

const heading: NodeSpec = {
  attrs: { level: { default: 1 }, align: { default: null }, indent: { default: null } },
  content: 'inline*',
  group: 'block',
  defining: true,
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement) => ({ level, ...blockAttrs(dom) }),
  })),
  toDOM: (node) => blockDOM(`h${node.attrs['level']}`, node),
};

const codeBlock: NodeSpec = {
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
  toDOM: () => ['pre', ['code', 0]],
};

const image: NodeSpec = {
  inline: true,
  attrs: { src: {}, alt: { default: null }, title: { default: null }, width: { default: null } },
  group: 'inline',
  draggable: true,
  parseDOM: [{
    tag: 'img[src]',
    getAttrs: (dom) => ({
      src: dom.getAttribute('src'), title: dom.getAttribute('title'), alt: dom.getAttribute('alt'), width: dom.getAttribute('width'),
    }),
  }],
  toDOM: (node) => {
    const { src, alt, title, width } = node.attrs;
    return ['img', { src, alt, title, width }];
  },
};

// ---------------------------------------------------------------- lists (also read and written as markdown)

/**
 * `tight` and `bullet` only matter for markdown (spec 1.170 §4.4): a tight list is written without blank lines
 * between items, `bullet` keeps the author's marker (`-`, `*`, `+`). HTML ignores both.
 */
const bulletList: NodeSpec = {
  ...slBulletList, content: 'list_item+', group: 'block',
  attrs: { tight: { default: true }, bullet: { default: null } },
};
const orderedList: NodeSpec = {
  ...slOrderedList, content: 'list_item+', group: 'block',
  attrs: { ...(slOrderedList.attrs ?? {}), tight: { default: true } },
};
/** `checked` = a markdown task item (`- [x] …`): true / false; null = an ordinary item. */
const listItem: NodeSpec = {
  ...slListItem, content: 'paragraph block*',
  attrs: { checked: { default: null } },
  parseDOM: [{
    tag: 'li',
    getAttrs: (dom) => ({ checked: dom.hasAttribute('data-checked') ? dom.getAttribute('data-checked') === 'true' : null }),
  }],
  toDOM: (node) => node.attrs['checked'] === null
    ? ['li', 0]
    : ['li', { class: 'rte-task', 'data-checked': String(node.attrs['checked']) }, 0],
};

/**
 * Markup the editor cannot express but must not lose (markdown only: HTML comments, `<img>` tags): kept verbatim,
 * shown as a grey chip, written back unchanged. Never created from stored HTML (their data attribute is ours) —
 * and even then the text is shown as text, never as markup.
 */
const rawHtml: NodeSpec = {
  inline: true, group: 'inline', atom: true, selectable: true,
  attrs: { html: { default: '' } },
  parseDOM: [{ tag: 'code[data-raw-html]', priority: 60, getAttrs: (dom) => ({ html: dom.textContent ?? '' }) }],
  toDOM: (node) => ['code', { class: 'rte-raw', 'data-raw-html': '' }, String(node.attrs['html'])],
};
const htmlBlock: NodeSpec = {
  group: 'block', atom: true, selectable: true,
  attrs: { html: { default: '' } },
  parseDOM: [{ tag: 'pre[data-raw-html]', priority: 60, getAttrs: (dom) => ({ html: dom.textContent ?? '' }) }],
  toDOM: (node) => ['pre', { class: 'rte-raw', 'data-raw-html': '' }, String(node.attrs['html'])],
};

export const richTextSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph,
    blockquote,
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
    heading,
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    code_block: codeBlock,
    image,
    list_item: listItem,
    ordered_list: orderedList,
    bullet_list: bulletList,
    raw_html: rawHtml,
    html_block: htmlBlock,
  },
  marks: {
    link,
    em,
    strong,
    code,
    u,
    s,
    text_color: textColor,
    text_background_color: textBackgroundColor,
    sup,
    sub,
  },
});
