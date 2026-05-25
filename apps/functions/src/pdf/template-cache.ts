// apps/functions/src/pdf/template-cache.ts
import Handlebars from 'handlebars';

type CompiledTemplate = HandlebarsTemplateDelegate;

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

export function compileTemplate(key: string, html: string, css?: string): CompiledTemplate {
  const cached = getCachedTemplate(key);
  if (cached) return cached;
  // Inject CSS into HTML before compiling so the template renders with styles
  const fullHtml = css ? html.replace('</head>', `<style>${css}</style></head>`) : html;
  const compiled = Handlebars.compile(fullHtml);
  setCachedTemplate(key, compiled);
  return compiled;
}
