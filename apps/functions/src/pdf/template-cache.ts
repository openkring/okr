// apps/functions/src/pdf/template-cache.ts
// handlebars is imported dynamically so it is not loaded at cold start (see browser-pool.ts).
import type { TemplateDelegate } from 'handlebars';
import { createHash } from 'crypto';

type CompiledTemplate = TemplateDelegate;

const MAX_SIZE = 50;
const cache = new Map<string, CompiledTemplate>();

/** key format: `${templateId}@${version}#${contentHash}` (see compileTemplate) */
export function getCachedTemplate(key: string): CompiledTemplate | undefined {
  return cache.get(key);
}

export function setCachedTemplate(key: string, fn: CompiledTemplate): void {
  if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, fn);
}

function injectCss(html: string, css: string): string {
  if (html.includes('</head>')) {
    return html.replace('</head>', `<style>${css}</style></head>`);
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `<style>${css}</style></body>`);
  }
  return `<style>${css}</style>${html}`;
}

/**
 * A draft keeps its version number while it is edited, so `${templateId}@${version}` alone would serve
 * the first compile of a draft for the lifetime of a warm instance (generateDocument has minInstances: 1).
 * The content hash makes every edit a new key.
 */
export async function compileTemplate(key: string, html: string, css?: string): Promise<CompiledTemplate> {
  const hash = createHash('sha256').update(html).update('\0').update(css ?? '').digest('hex').slice(0, 16);
  const contentKey = `${key}#${hash}`;
  const cached = getCachedTemplate(contentKey);
  if (cached) return cached;
  const { default: Handlebars } = await import('handlebars');
  // Inject CSS into HTML before compiling so the template renders with styles
  const fullHtml = css ? injectCss(html, css) : html;
  const compiled = Handlebars.compile(fullHtml);
  setCachedTemplate(contentKey, compiled);
  return compiled;
}
