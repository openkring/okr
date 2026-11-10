import type { SanitizeFn } from './section-mapper';

/** The call shape of the `sanitize-html` function; render never imports the package (injected by the caller). */
export type SanitizeHtmlLike = (dirty: string, options: Record<string, unknown>) => string;

// Article-fragment allowlist: formatting + links + images, no active content.
export const ARTICLE_SANITIZE_OPTIONS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'a', 'img', 'figure', 'figcaption',
  ],
  // script, iframe, object, embed, form, base, link, meta, style are NOT listed,
  // so sanitize-html drops them entirely. Inline `style` attributes are also
  // dropped (not in allowedAttributes) to remove the expression()/url() vector.
  allowedAttributes: {
    '*': ['class', 'id', 'align', 'width', 'height'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    col: ['span', 'width'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowProtocolRelative: false,
  // Force rel=noopener noreferrer on any target=_blank link (reverse-tabnabbing).
  transformTags: {
    a: (tagName: string, attribs: Record<string, string>) => {
      if (attribs['target'] === '_blank') {
        attribs['rel'] = 'noopener noreferrer';
      }
      return { tagName, attribs };
    },
  },
};

/** A sanitizer for article-fragment HTML, built on the caller's `sanitize-html` function. */
export function createSanitizer(sanitizeHtml: SanitizeHtmlLike): SanitizeFn {
  return (html: string): string => (html ? sanitizeHtml(html, ARTICLE_SANITIZE_OPTIONS) : '');
}
