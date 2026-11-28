// apps/functions/src/email/mail-page/mail-text.logic.ts
//
// The html of a text or callout block, made fit for a mail (spec 1.176 §9.1): links a mail client can open, styles and
// pictures that cannot break the layout, nothing active. Works on the OUTPUT of `sanitizeEmailBody` only, which is well
// formed (values in double quotes, `<`, `>`, `&` and `"` in them escaped, no comments), so tags can be read one by one.
import { isTrackingPicture, mailTargetUrl } from '@okr/shared-util-core';

import { pictureUrl } from './mail-picture.logic';

export interface MailTextOptions {
  /** makes an app path absolute; `''` keeps the path (Mitteilung) */
  appOrigin: string;
  /** the width of the text in px; a picture in it is not drawn wider (Outlook reads the attribute) */
  width: number;
  /** the widest the text is ever drawn (a column stacked on the phone); a picture has twice the pixels */
  widestWidth: number;
  /** on paper a picture is at most 80 mm high */
  print: boolean;
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&amp;': '&' };

function decode(value: string): string {
  return value.replace(/&(lt|gt|quot|amp);/g, (entity) => ENTITIES[entity]);
}

function encode(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attributesOf(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, value] of raw.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) attributes[name.toLowerCase()] = decode(value ?? '');
  return attributes;
}

/** A link of a text: as a button, and http, which is normal in typed text; `''` loses the link. */
function textLinkUrl(href: string, appOrigin: string): string {
  const url = href.trim();
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/^http:\/\/[^\s/?#]/i.test(url) && !/[\\\u0000-\u001f\u007f]/.test(url)) return `http${url.slice('http'.length)}`;
  return mailTargetUrl(url, appOrigin);
}

/** What a text may set itself; anything else (positions, widths, `mso-…`) is left to the template. */
const STYLE_PROPERTIES = new RegExp('^('
  + 'color|background|background-color|font|font-(family|size|style|weight|variant)|text-(align|indent|transform)|text-decoration(-(line|style|color))?|'
  + 'line-height|letter-spacing|vertical-align|direction|border|border-[a-z-]+|margin(-(top|right|bottom|left))?|padding(-(top|right|bottom|left))?|list-style(-(type|position))?'
  + ')$');

function isKeptDeclaration(property: string, value: string): boolean {
  if (!STYLE_PROPERTIES.test(property) || value === '') return false;
  // the only function a value may call is a colour
  if (/[\\<>{}@]|\/\*|(?<!\b(?:rgb|rgba|hsl|hsla))\(/i.test(value)) return false;
  if ((value.match(/"/g)?.length ?? 0) % 2 !== 0 || (value.match(/'/g)?.length ?? 0) % 2 !== 0) return false;
  return !(/^(margin|text-indent)/.test(property) && /(^|\s)-/.test(value));
}

function keptStyle(style: string): string {
  return style.split(';').map((declaration) => {
    const colon = declaration.indexOf(':');
    const property = declaration.slice(0, Math.max(0, colon)).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    return isKeptDeclaration(property, value) ? `${property}:${value}` : '';
  }).filter((d) => d !== '').join(';');
}

/** The attributes other than href, src and style that a text keeps, with what they may hold. */
const KEPT_ATTRIBUTES: Record<string, RegExp> = {
  align: /^(left|center|right|justify)$/i, colspan: /^\d{1,2}$/, rowspan: /^\d{1,3}$/, border: /^\d$/, cellpadding: /^\d{1,2}$/, cellspacing: /^\d{1,2}$/,
  // a table in px would be wider than the mail
  width: /^(\d{1,2}|100)%$/,
};

function pixels(value: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(px)?$/.exec(value?.trim() ?? '');
  return match ? Number(match[1]) : undefined;
}

/** A picture the mail can show (`isMailTextPicture` of shared-util-core, which the app's validation uses): a tracking one goes, any other is its alt text. */
function pictureTag(attributes: Record<string, string>, options: MailTextOptions): string {
  const alt = attributes['alt'] ?? '';
  // pictures of 1 or 2 px count who opens the mail
  if (isTrackingPicture(attributes)) return '';
  const width = pixels(attributes['width']);
  const src = pictureUrl(attributes['src'], 2 * Math.min(Math.round(width ?? options.widestWidth), options.widestWidth));
  // the sanitizer lets relative and `data:` addresses pass
  if (!src) return encode(alt);
  return `<img src="${encode(src)}" alt="${encode(alt)}"${width ? ` width="${Math.min(Math.round(width), options.width)}"` : ''} style="${options.print ? 'width:auto;max-height:80mm;' : ''}max-width:100%;height:auto" />`;
}

/** An opening tag with what it keeps. Classes and ids go: they could meet rules of the layout. */
function plainTag(name: string, attributes: Record<string, string>, selfClosing: boolean): string {
  const kept = Object.entries(attributes).filter(([key, value]) => KEPT_ATTRIBUTES[key]?.test(value)).map(([key, value]) => ` ${key}="${encode(value)}"`).join('');
  const style = keptStyle(attributes['style'] ?? '');
  return `<${name}${kept}${style ? ` style="${encode(style)}"` : ''}${selfClosing ? ' />' : '>'}`;
}

const VOID_TAGS = ['br', 'hr', 'img'];
const ROW_GROUPS = ['tbody', 'thead', 'tfoot'];
/** the parts of a table, with the tags they may stand in */
const TABLE_PARENTS: Record<string, string[]> = {
  caption: ['table'], tbody: ['table'], thead: ['table'], tfoot: ['table'], tr: ['table', ...ROW_GROUPS], td: ['tr'], th: ['tr'],
};
const CELLS = ['td', 'th', 'caption'];

/**
 * The tag to write instead of `name` inside the open tags, `''` for none. A browser closes the cell of the block when it meets
 * a table part that is not where it belongs, or a table directly in a table; so such a part becomes a <div>, or goes.
 */
function writtenTag(name: string, open: readonly string[]): string {
  if (name === 'col' || name === 'colgroup') return ''; // widths only
  if (name === 'table') {
    const around = [...open].reverse().find((tag) => tag === 'table' || tag in TABLE_PARENTS);
    return around === undefined || CELLS.includes(around) ? name : '';
  }
  if (!Object.keys(TABLE_PARENTS).includes(name) || TABLE_PARENTS[name].includes(open[open.length - 1])) return name;
  return ROW_GROUPS.includes(name) ? '' : 'div';
}

/** Adds a declaration to the style of the tag at `position`. */
function withDeclaration(html: string, position: number, declaration: string): string {
  const end = html.indexOf('>', position);
  const tag = html.slice(position, end);
  const styled = /\sstyle="[^"]*$/.test(tag.slice(0, -1)) ? `${tag.slice(0, -1)};${declaration}"` : `${tag} style="${declaration}"`;
  return html.slice(0, position) + styled + html.slice(end);
}

/** The first and last paragraph, heading or list have no outer margin: the cell sets the distance to the other blocks. */
function withoutOuterMargins(html: string): string {
  const trimmed = html.trim();
  const topLevel: { name: string; start: number; end: number }[] = [];
  let depth = 0;
  for (const tag of trimmed.matchAll(/<(\/?)([a-z][a-z0-9]*)[^>]*>/g)) {
    if (VOID_TAGS.includes(tag[2])) continue;
    if (!tag[1] && depth++ === 0) topLevel.push({ name: tag[2], start: tag.index, end: -1 });
    if (tag[1] && --depth === 0) topLevel[topLevel.length - 1].end = tag.index + tag[0].length;
  }
  const hasMargin = (name: string | undefined) => /^(p|h[1-6]|ul|ol)$/.test(name ?? '');
  const [first, last]: ((typeof topLevel)[number] | undefined)[] = [topLevel[0], topLevel[topLevel.length - 1]];
  let result = trimmed;
  // the last one first: the position of the first stays valid
  if (last && last.end === trimmed.length && hasMargin(last.name)) result = withDeclaration(result, last.start, 'margin-bottom:0');
  if (first && first.start === 0 && hasMargin(first.name)) result = withDeclaration(result, 0, 'margin-top:0');
  return result;
}

/**
 * An empty line the sender typed (`<p></p>`, `<p><br></p>`) gets a non-breaking space: a mail program draws an empty paragraph
 * without height, so the line would be lost, while the editor shows it.
 */
export function withFilledEmptyLines(html: string): string {
  return html.replace(/<p(\s[^>]*)?>\s*(?:<br\s*\/?>\s*)?<\/p>/gi, (_match, attributes: string | undefined) => `<p${attributes ?? ''}>&nbsp;</p>`);
}

/** The gap below a paragraph in a list item, instead of the 16px a paragraph gets (`sanitizeEmailBody`). */
export const LIST_ITEM_GAP = '0 0 4px';

/** The style of a paragraph in a list item: its margin is `LIST_ITEM_GAP`, the rest stays. */
export function listItemParagraphStyle(style: string): string {
  const rest = style.split(';').map((d) => d.trim()).filter((d) => d !== '' && !/^margin\s*:/i.test(d));
  return [`margin:${LIST_ITEM_GAP}`, ...rest].join(';');
}

/** The sanitized html of a text, fit for a mail. */
export function mailTextHtml(sanitized: string, options: MailTextOptions): string {
  const written: string[] = []; // per open tag what was written for it; '' = nothing
  const html = withFilledEmptyLines(sanitized).replace(/<(\/?)([a-z][a-z0-9]*)([^>]*)>/gi, (_tag, slash: string, name: string, rest: string) => {
    if (slash) {
      const tag = written.pop();
      return tag ? `</${tag}>` : '';
    }
    const attributes = attributesOf(rest);
    if (name === 'img') return pictureTag(attributes, options);
    if (VOID_TAGS.includes(name)) return plainTag(name, attributes, true);
    if (name === 'a') {
      const url = textLinkUrl(attributes['href'] ?? '', options.appOrigin);
      const style = keptStyle(attributes['style'] ?? '');
      written.push(url ? 'a' : '');
      return url ? `<a href="${encode(url)}" target="_blank"${style ? ` style="${encode(style)}"` : ''}>` : '';
    }
    const open = written.filter((t) => t !== '');
    const tag = writtenTag(name, open);
    written.push(tag);
    // a paragraph of a list item: its items stand close together, not a paragraph apart
    if (tag === 'p' && open[open.length - 1] === 'li') attributes['style'] = listItemParagraphStyle(attributes['style'] ?? '');
    if (tag === '') return '';
    return tag === name ? plainTag(name, attributes, false) : `<${tag}>`;
  });
  return withoutOuterMargins(html);
}
