// apps/functions/src/pdf/template-cache.ts
// handlebars is imported dynamically so it is not loaded at cold start (see browser-pool.ts).
import type { TemplateDelegate } from 'handlebars';

type CompiledTemplate = TemplateDelegate;

const MAX_SIZE = 50;
const cache = new Map<string, CompiledTemplate>();

/** key format: `${templateId}@${version}` */
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

export async function compileTemplate(key: string, html: string, css?: string): Promise<CompiledTemplate> {
  const cached = getCachedTemplate(key);
  if (cached) return cached;
  const { default: Handlebars } = await import('handlebars');
  // Inject CSS into HTML before compiling so the template renders with styles
  const fullHtml = css ? injectCss(html, css) : html;
  const compiled = Handlebars.compile(fullHtml);
  setCachedTemplate(key, compiled);
  return compiled;
}
