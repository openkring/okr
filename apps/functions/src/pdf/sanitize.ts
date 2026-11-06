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

/** A `transformTags` entry: the margin goes first, so a margin the author set wins. */
function withMargin(margin: string) {
  return (tagName: string, attribs: Record<string, string>) => ({
    tagName,
    attribs: { ...attribs, style: attribs['style'] ? `margin:${margin};${attribs['style']}` : `margin:${margin}` },
  });
}

async function sanitizeWith(html: string, options: Record<string, unknown>): Promise<string> {
  const sanitize = (await import('sanitize-html')).default;
  return sanitize(html, options);
}

/** Sanitize untrusted HTML for Puppeteer rendering. */
export function sanitizeHtml(html: string): Promise<string> {
  return sanitizeWith(html, SANITIZE_OPTIONS);
}

// A composed mail is read in a mail client and has its own policy: no document structure or <style>
// (the layout supplies them, and a <style> block in the body could restyle the whole mail), only inline
// style attributes. Links take https, http, mailto and tel (plain http and tel are normal in typed text);
// `data:` is for images only, never for a link. Images stay https or data, so the reader's client does
// not fetch over cleartext.
const EMAIL_SANITIZE_OPTIONS = {
  allowedTags: SANITIZE_OPTIONS.allowedTags.filter((tag) => !['html', 'head', 'body', 'style'].includes(tag)),
  allowedAttributes: SANITIZE_OPTIONS.allowedAttributes,
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowProtocolRelative: false,
};

/** Sanitize the body of a composed mail (composer, mail jobs, invoice mails). */
export function sanitizeEmailBody(html: string): Promise<string> {
  return sanitizeWith(html, EMAIL_SANITIZE_OPTIONS);
}

// A reset mail carries a link that opens an account, and its templates are tenant-editable. Everything
// that could read or lead away the link goes: <style> (attribute selectors read an href), comments, active
// content, and every attribute that fetches or runs something from an <a>. The output is well-formed
// whatever went in, which is what lets `placeResetLink` check it, and it is what gets sent.
const RESET_MAIL_SANITIZE_OPTIONS = {
  allowedTags: [
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'div', 'span', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 'small', 'a', 'img', 'ul', 'ol', 'li', 'center', 'blockquote',
  ],
  allowedAttributes: {
    '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'role', 'cellpadding', 'cellspacing', 'border', 'colspan', 'rowspan', 'dir'],
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: { a: ['https', 'mailto'], img: ['https'] },
  allowProtocolRelative: false,
  // The default list, plus the document title that would otherwise land in the mail as text.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'],
  // The layout's `p { margin:0; }` block is gone, and the seeded text spaces itself with `<p>&nbsp;</p>`.
  transformTags: { p: withMargin('0') },
};

/** The rendered html of a password-reset mail, as it may be sent. Never used for other mail. */
export function sanitizeResetMail(html: string): Promise<string> {
  return sanitizeWith(html, RESET_MAIL_SANITIZE_OPTIONS);
}
