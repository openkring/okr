// apps/functions/src/pdf/sanitize.ts

/** Remove external <script> tags from untrusted HTML before Puppeteer rendering. */
export function sanitizeHtml(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '');
}
