import { marked } from 'marked';
import MarkdownIt from 'markdown-it';
import type { StateCore, Token } from 'markdown-it';
import { Node as PMNode } from 'prosemirror-model';
import { defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown';

import { richTextSchema as schema } from './rich-text.schema';

/** What an empty markdown field stores. */
export const EMPTY_MARKDOWN = '';

const TASK_PREFIX = /^\[([ xX])\][ \t]/;

/**
 * Two adjustments so nothing the diary texts use is lost (spec 1.170 §4.4, corpus audit 2026-11-22):
 * - a task item (`- [x] …`, 9'358 of them in 876 texts) becomes `checked` on its list item instead of literal text;
 * - a single line break inside a paragraph stays a line break — markdown-it would turn it into a space and the
 *   next save would re-flow every paragraph the author broke by hand.
 */
function taskItemsAndLineBreaks(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'inline') continue;
    if (i >= 2 && tokens[i - 1].type === 'paragraph_open' && tokens[i - 2].type === 'list_item_open') {
      const match = TASK_PREFIX.exec(token.content);
      const first = token.children?.[0];
      if (match && first?.type === 'text' && first.content.startsWith(match[0])) {
        tokens[i - 2].meta = { ...(tokens[i - 2].meta ?? {}), checked: match[1] !== ' ' };
        first.content = first.content.slice(match[0].length);
        token.content = token.content.slice(match[0].length);
      }
    }
    for (const child of token.children ?? []) {
      if (child.type === 'softbreak') { child.type = 'text'; child.content = '\n'; }
    }
  }
}

/** A list is tight when markdown-it hides the paragraphs of its first item (prosemirror-markdown's own rule). */
function listIsTight(tokens: Token[], i: number): boolean {
  while (++i < tokens.length) {
    if (tokens[i].type !== 'list_item_open') return tokens[i].hidden;
  }
  return false;
}

// CommonMark plus strikethrough; HTML on, so comments and tags arrive as tokens we keep instead of as text
const tokenizer = new MarkdownIt('commonmark', { html: true }).enable('strikethrough');
tokenizer.core.ruler.push('okr_task_items_line_breaks', taskItemsAndLineBreaks);

const parser = new MarkdownParser(schema, tokenizer, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item', getAttrs: (tok) => ({ checked: (tok.meta as { checked?: boolean } | null)?.checked ?? null }) },
  bullet_list: { block: 'bullet_list', getAttrs: (tok, tokens, i) => ({ tight: listIsTight(tokens, i), bullet: tok.markup || null }) },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok, tokens, i) => ({ order: Number(tok.attrGet('start') ?? 1), tight: listIsTight(tokens, i) }),
  },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', noCloseToken: true },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({ src: tok.attrGet('src'), title: tok.attrGet('title') || null, alt: tok.children?.[0]?.content || null }),
  },
  hardbreak: { node: 'hard_break' },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 's' },
  link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }) },
  code_inline: { mark: 'code', noCloseToken: true },
  html_block: { node: 'html_block', getAttrs: (tok) => ({ html: tok.content.replace(/\n+$/, '') }) },
  html_inline: { node: 'raw_html', getAttrs: (tok) => ({ html: tok.content }) },
});

/** Bare URLs are written unescaped: `\_` inside one would break the link marked makes of it. */
const URL_IN_TEXT = /https?:\/\/[^\s<>()]+/g;

function writeText(state: MarkdownSerializerState, text: string): void {
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const at = match.index ?? 0;
    if (at > last) state.text(text.slice(last, at));
    state.text(match[0], false);
    last = at + match[0].length;
  }
  if (last < text.length) state.text(text.slice(last));
}

const nodes = defaultMarkdownSerializer.nodes;
const serializer = new MarkdownSerializer(
  {
    ...nodes,
    text: (state, node) => writeText(state, node.text ?? ''),
    // a new list gets '-' (what the diary files use); a parsed one keeps its own marker
    bullet_list: (state, node) => state.renderList(node, '  ', () => `${(node.attrs['bullet'] as string | null) || '-'} `),
    list_item: (state, node, parent, index) => {
      const checked = node.attrs['checked'];
      if (checked !== null) state.write(checked ? '[x] ' : '[ ] ');
      nodes['list_item'](state, node, parent, index);
    },
    raw_html: (state, node) => state.text(String(node.attrs['html']), false),
    html_block: (state, node) => {
      state.text(String(node.attrs['html']), false);
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    s: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    // marks markdown cannot express (pasted from elsewhere): their text stays, the formatting goes
    u: { open: '', close: '' },
    sup: { open: '', close: '' },
    sub: { open: '', close: '' },
    text_color: { open: '', close: '' },
    text_background_color: { open: '', close: '' },
  },
);

/** Parses stored markdown into a document of the rich-text schema; empty input gives one empty paragraph. */
export function markdownToDoc(markdown: string | undefined | null): PMNode {
  const doc = markdown ? parser.parse(markdown) : null;
  return doc && doc.childCount > 0 ? doc : schema.node('doc', null, [schema.node('paragraph')]);
}

/** Serialises a document to the markdown string that is stored. Alignment, indent and colours are not markdown. */
export function docToMarkdown(doc: PMNode): string {
  return serializer.serialize(doc, { tightLists: true });
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
/** What the read views show (marked, comments stripped), with insignificant whitespace folded. */
function rendered(markdown: string): string {
  return (marked.parse(markdown.replace(HTML_COMMENT, ''), { async: false }) as string).replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}

/**
 * True when the editor can show `markdown` without changing what the read views display. The editor parses
 * with markdown-it, the views render with marked, and the two disagree on a few inputs (a single `~` is
 * strikethrough only in marked; some list indents are lists only in marked) — 33 of 7'487 diary texts
 * (2026-11-22). Such a text is edited as source instead, so opening it never rewrites it.
 */
export function editsFaithfully(markdown: string | undefined | null): boolean {
  if (!markdown) return true;
  return rendered(markdown) === rendered(docToMarkdown(markdownToDoc(markdown)));
}
