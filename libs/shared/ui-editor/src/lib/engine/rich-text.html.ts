import { DOMParser, DOMSerializer, Node as PMNode } from 'prosemirror-model';

import { richTextSchema } from './rich-text.schema';

/** What an empty editor stores (the old editor wrote the same). */
export const EMPTY_HTML = '<p></p>';

/**
 * Parses stored HTML into a document of the rich-text schema; empty input gives one empty paragraph.
 * The HTML is read into an inert document (the browser's DOMParser), never into a live element:
 * an `<img onerror=…>` assigned to innerHTML of a detached div still loads and runs its handler.
 */
export function htmlToDoc(html: string | undefined | null): PMNode {
  if (!html) return richTextSchema.node('doc', null, [richTextSchema.node('paragraph')]);
  const inert = new globalThis.DOMParser().parseFromString(html, 'text/html');
  return DOMParser.fromSchema(richTextSchema).parse(inert.body);
}

/** Serialises a document back to the HTML string that is stored (built from schema nodes, not from input HTML). */
export function docToHtml(doc: PMNode): string {
  const fragment = DOMSerializer.fromSchema(richTextSchema).serializeFragment(doc.content);
  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}
