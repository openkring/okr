// apps/functions/src/pdf/template-cache.ts
// handlebars is imported dynamically so it is not loaded at cold start (see browser-pool.ts).
import type { TemplateDelegate } from 'handlebars';
import { createHash } from 'crypto';

type CompiledTemplate = TemplateDelegate;
type HandlebarsEnv = typeof import('handlebars');

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

let quietEnv: HandlebarsEnv | undefined;

/**
 * Handlebars with a `log` helper that does nothing. Email templates are tenant-editable and render
 * personal data, and `{{log this}}` would print it to the function log. A separate environment, because
 * PDF templates keep the global helper.
 */
function withoutLog(Handlebars: HandlebarsEnv): HandlebarsEnv {
  if (!quietEnv) {
    quietEnv = Handlebars.create();
    quietEnv.registerHelper('log', () => '');
  }
  return quietEnv;
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
 *
 * `noEscape` (email text and subject) and `noLog` (email) compile the same source differently, so both flags
 * are part of the hash.
 */
export async function compileTemplate(
  key: string,
  html: string,
  css?: string,
  options?: { noEscape?: boolean; noLog?: boolean }
): Promise<CompiledTemplate> {
  const noEscape = options?.noEscape === true;
  const noLog = options?.noLog === true;
  const hash = createHash('sha256')
    .update(html)
    .update('\0')
    .update(css ?? '')
    .update('\0')
    .update(noEscape ? 'raw' : 'html')
    .update(noLog ? 'quiet' : 'log')
    .digest('hex')
    .slice(0, 16);
  const contentKey = `${key}#${hash}`;
  const cached = getCachedTemplate(contentKey);
  if (cached) return cached;
  const { default: Handlebars } = await import('handlebars');
  // Inject CSS into HTML before compiling so the template renders with styles
  const fullHtml = css ? injectCss(html, css) : html;
  const compiled = (noLog ? withoutLog(Handlebars) : Handlebars).compile(fullHtml, { noEscape });
  setCachedTemplate(contentKey, compiled);
  return compiled;
}
