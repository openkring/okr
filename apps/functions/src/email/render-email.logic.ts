// apps/functions/src/email/render-email.logic.ts
// Pure decisions of the email renderer. The Firestore-backed renderer builds on these.
import type { EmailLayoutChoice, TemplateKind } from '@okr/shared-models';

/** The slice of a `templates/{id}` doc the renderer reads. Legacy docs have no `kind`. */
export interface StoredTemplate {
  kind?: TemplateKind;
  tenants?: string[];
  isArchived?: boolean;
  currentVersion?: number;
  sampleData?: string;
}

/** The `tenants` entry of a shared email template: the operator's, used by every tenant. */
export const SHARED_TEMPLATE_OWNER = 'system';

/**
 * A template is usable when it is of the wanted kind, published, not archived and owned exactly by
 * `owner`: the tenant for a fork key, `system` for a base key. Containing the owner is not enough. The
 * rules let a tenant create a doc under any key with a mixed `tenants`, and that tenant's edit must
 * not reach another tenant's mail (design 7.2).
 */
export function isUsableEmailTemplate(doc: StoredTemplate | undefined, owner: string, kind: TemplateKind): boolean {
  if (!doc) return false;
  if ((doc.kind ?? 'pdf') !== kind) return false;
  if (doc.isArchived === true) return false;
  if ((doc.currentVersion ?? 0) < 1) return false;
  return doc.tenants?.length === 1 && doc.tenants[0] === owner;
}

/** An emailLayout must carry the unescaped content slot, otherwise the body would vanish from the mail. */
export function layoutHasContent(source: string): boolean {
  return /\{\{\{\s*content\s*\}\}\}/.test(source);
}

const WHITESPACE = '\t\n\f\r ';
/** Their content is text to the browser, whatever it looks like. */
const RAW_TEXT_ELEMENTS = ['iframe', 'noembed', 'noframes', 'noscript', 'style', 'textarea', 'title', 'xmp'];

interface HtmlAttribute {
  name: string;
  value: string;
  quote: string;
}

interface HtmlTag {
  name: string;
  attributes: HtmlAttribute[];
  /** Index just behind the closing `>`. */
  end: number;
}

function skipOver(html: string, chars: string, from: number): number {
  let i = from;
  while (i < html.length && chars.includes(html[i])) i++;
  return i;
}

function skipUntil(html: string, chars: string, from: number): number {
  let i = from;
  while (i < html.length && !chars.includes(html[i])) i++;
  return i;
}

/** Reads one tag the way the HTML tokenizer does, from its name on. An unfinished tag gives `undefined`. */
function readTag(html: string, nameStart: number): HtmlTag | undefined {
  let i = skipUntil(html, `${WHITESPACE}/>`, nameStart);
  const name = html.slice(nameStart, i).toLowerCase();
  const attributes: HtmlAttribute[] = [];
  for (;;) {
    i = skipOver(html, `${WHITESPACE}/`, i);
    if (i >= html.length) return undefined;
    if (html[i] === '>') return { name, attributes, end: i + 1 };

    const attributeStart = i;
    i = skipUntil(html, `${WHITESPACE}/>=`, i + 1);
    const attribute: HtmlAttribute = { name: html.slice(attributeStart, i).toLowerCase(), value: '', quote: '' };
    attributes.push(attribute);
    i = skipOver(html, WHITESPACE, i);
    if (html[i] !== '=') continue;

    i = skipOver(html, WHITESPACE, i + 1);
    if (html[i] === '"' || html[i] === "'") {
      const close = html.indexOf(html[i], i + 1);
      if (close < 0) return undefined;
      attribute.quote = html[i];
      attribute.value = html.slice(i + 1, close);
      i = close + 1;
    } else {
      const valueStart = i;
      i = skipUntil(html, `${WHITESPACE}>`, i);
      attribute.value = html.slice(valueStart, i);
    }
  }
}

function isExactLink(tag: HtmlTag, token: string): boolean {
  const hrefs = tag.attributes.filter((attribute) => attribute.name === 'href');
  return tag.name === 'a' && hrefs.length === 1 && hrefs[0].quote === '"' && hrefs[0].value === token;
}

/** Index just behind `end`, or the end of the html when `end` never comes. */
function behind(html: string, end: string, from: number): number {
  const at = html.indexOf(end, from);
  return at < 0 ? html.length : at + end.length;
}

/** Where the end tag of a raw-text element starts, or the end of the html when it has none. */
function rawTextEnd(html: string, element: string, from: number): number {
  const endTag = new RegExp(`</${element}[${WHITESPACE}/>]`, 'gi');
  endTag.lastIndex = from;
  return endTag.exec(html)?.index ?? html.length;
}

/**
 * How often the token is the exact, double-quoted `href` of a real `<a>` tag. The html is walked like a
 * browser walks it, so a comment, a style block or another attribute that only looks like such a tag
 * does not count. A mail with a script or plaintext element gives 0: their parsing is not modelled here.
 */
function exactLinkCount(html: string, token: string): number {
  let count = 0;
  let i = html.indexOf('<');
  while (i >= 0 && i < html.length) {
    const next = html[i + 1] ?? '';
    if (html.startsWith('<!--', i)) {
      i = behind(html, '-->', i + 2);
    } else if (html.startsWith('<![CDATA[', i)) {
      i = behind(html, ']]>', i);
    } else if (next === '!' || next === '?' || (next === '/' && !/[a-z]/i.test(html[i + 2] ?? ''))) {
      i = behind(html, '>', i);
    } else if (/[a-z/]/i.test(next)) {
      const tag = readTag(html, next === '/' ? i + 2 : i + 1);
      if (!tag) break;
      if (tag.name === 'script' || tag.name === 'plaintext') return 0;
      i = tag.end;
      if (next !== '/') {
        if (isExactLink(tag, token)) count++;
        if (RAW_TEXT_ELEMENTS.includes(tag.name)) i = rawTextEnd(html, tag.name, i);
      }
    } else {
      i++;
    }
    i = html.indexOf('<', i);
  }
  return count;
}

/**
 * Swaps the token of a rendered reset mail for the real link, which never enters a template (a template
 * can read a variable character by character, so only the token may be readable to it). `undefined`
 * unless the token is the exact `href` of an `<a>` at least once and nowhere else in the html, at least
 * once in the text, and never in the subject. So a template cannot lead the link anywhere but into a link.
 */
export function placeResetLink(mail: { html: string; text: string; subject: string }, token: string, link: string): { html: string; text: string } | undefined {
  if (mail.subject.includes(token) || !mail.text.includes(token)) return undefined;
  const htmlParts = mail.html.split(token);
  const occurrences = htmlParts.length - 1;
  if (occurrences === 0 || exactLinkCount(mail.html, token) !== occurrences) return undefined;
  return {
    html: htmlParts.join(link.replace(/&/g, '&amp;').replace(/"/g, '&quot;')),
    text: mail.text.split(token).join(link),
  };
}

/** The layout a client asked for: `plain` only when it says so, `standard` for anything else (also none). */
export function asLayoutChoice(value: unknown): EmailLayoutChoice {
  return value === 'plain' ? 'plain' : 'standard';
}
