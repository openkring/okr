// apps/functions/src/publicApi/sanitize.ts
//
// Server-side HTML sanitization for the public website API (M-7 hardening).
//
// The publicApi returns CMS section HTML (htmlContent / contentI18n / excerpt)
// to the static websites (apps/*-website), which render it via raw `innerHTML`
// (e.g. seite.html, news-artikel.html). Unlike the Angular PWA — where Angular's
// DomSanitizer scrubs [innerHTML] bindings — the static sites have NO client-side
// sanitizer. CMS authoring is content-role gated, but a compromised/careless
// content author could otherwise store <script>/<img onerror>/<iframe> that would
// then execute on every public visitor's browser (stored XSS).
//
// Sanitizing here, at the single public gateway, protects every static site at
// once. The allowlist is tuned for rich article fragments (no html/head/body —
// these are HTML snippets injected into an existing page, not full documents).
//
// sanitize-html is imported dynamically (and marked esbuild-external) so it is
// not loaded at cold start for the GET routes that return no HTML.

// Article-fragment allowlist: formatting + links + images, no active content.
const ARTICLE_SANITIZE_OPTIONS = {
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

type SanitizeFn = (html: string) => string;
let cached: SanitizeFn | undefined;

/**
 * Returns a sanitizer for article-fragment HTML. The underlying sanitize-html
 * module is imported once per instance and cached.
 */
export async function getHtmlSanitizer(): Promise<SanitizeFn> {
  if (cached) return cached;
  const sanitize = (await import('sanitize-html')).default;
  cached = (html: string): string => (html ? sanitize(html, ARTICLE_SANITIZE_OPTIONS) : '');
  return cached;
}

/** Sanitize every value of an i18n string map in place-safe fashion. */
export function sanitizeI18n(
  i18n: Record<string, string> | undefined,
  sanitize: SanitizeFn,
): Record<string, string> | undefined {
  if (!i18n) return i18n;
  const out: Record<string, string> = {};
  for (const [lang, html] of Object.entries(i18n)) {
    out[lang] = sanitize(html ?? '');
  }
  return out;
}
