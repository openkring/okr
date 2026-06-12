// apps/functions/src/pdf/sanitize.ts
//
// Sanitize untrusted (admin-supplied "raw HTML mode") HTML before Puppeteer
// rendering. The previous implementation only stripped <script> via regex, which
// left <iframe>, <img onerror>, <link>, etc. able to execute and fire outbound
// requests (SSRF / data exfiltration from the function's network — M-4).
//
// This uses sanitize-html with a document-oriented allowlist that keeps rich
// formatting + inline styles but removes active-content tags and event handlers.
// It is paired with Puppeteer request blocking in raw-HTML mode (generate-document)
// so that any url() in CSS / <img>/<style> cannot reach the network.
//
// sanitize-html is imported dynamically (and marked esbuild-external) so it is not
// loaded at cold start for non-pdf functions.

// Allowlist tuned for printable documents (kept as a plain object — sanitize-html
// is loaded dynamically and untyped here on purpose, see note above).
const SANITIZE_OPTIONS = {
  allowedTags: [
    'html', 'head', 'body', 'style',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'a', 'img', 'figure', 'figcaption',
  ],
  // Dangerous tags (script, iframe, object, embed, form, base, link, meta) are not
  // listed, so sanitize-html drops them entirely.
  allowedAttributes: {
    '*': ['style', 'class', 'id', 'align', 'width', 'height'],
    a: ['href', 'name', 'target'],
    img: ['src', 'alt', 'width', 'height'],
    col: ['span', 'width'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    table: ['border', 'cellpadding', 'cellspacing'],
  },
  // No javascript:/http:/file:/ftp: — only TLS URLs, data URIs and mailto links.
  allowedSchemes: ['https', 'data', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowProtocolRelative: false,
  // <style> is kept for document layout; its url()s cannot fetch anything because
  // raw-HTML rendering blocks all external network (see generate-document.ts).
  allowVulnerableTags: true,
};

/** Sanitize untrusted HTML for Puppeteer rendering. */
export async function sanitizeHtml(html: string): Promise<string> {
  const sanitize = (await import('sanitize-html')).default;
  return sanitize(html, SANITIZE_OPTIONS);
}
