import Handlebars from 'handlebars';
import type { HelperOptions } from 'handlebars';

import { pickText, type I18nString } from './section-mapper';

export type HandlebarsEnv = typeof Handlebars;

/** The `@`-data every template of a render receives (`{{@lang}}`, `{{@year}}`). */
export interface RenderData {
  lang: string;
  year: number;
}

/**
 * A site path in a language directory: '/vorstand' → '/en/vorstand', '/' → '/en/'. German is the
 * root. Anything that is not a same-site path (https, mailto, tel, '#…', protocol-relative) stays.
 */
export function langPath(path: string, lang: string): string {
  if (lang === 'de' || !path.startsWith('/') || /^\/[/\\]/.test(path)) return path;
  return path === '/' ? `/${lang}/` : `/${lang}${path}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** The helper's options are always the last argument; the rest are the template's params. */
function split(args: unknown[]): { params: unknown[]; options: HelperOptions } {
  const options = args[args.length - 1] as HelperOptions;
  return { params: args.slice(0, -1), options };
}

function langOf(options: HelperOptions): string {
  const lang = (options.data as Partial<RenderData> | undefined)?.lang;
  return typeof lang === 'string' ? lang : 'de';
}

/**
 * A Handlebars environment for website templates. Templates are data, not code:
 * - default HTML escaping stays on; only `{{{…}}}` outputs raw HTML, and the context carries raw
 *   HTML only where it was sanitized (section rich text) or rendered by our own templates;
 * - prototype access stays at the Handlebars default (denied), so `{{constructor.constructor}}`
 *   renders nothing;
 * - the built-in `log` helper is removed: a template cannot write the context to the function log
 *   (`{{log …}}` fails the render as a missing helper).
 *
 * Helpers:
 * - `eq a b` — strict equality, for `{{#if (eq style "button")}}`.
 * - `url "/path"` — the path in the current language directory (see langPath). Bare `{{url}}`
 *   (no param) reads the context's own `url` field unchanged, because a helper shadows a field of
 *   the same name; context urls (nav, page, alternates) are already in the right language.
 * - `t plain i18n` — pickText: the `i18n` map's entry for the current language, else the German
 *   `plain` text.
 * - `year` — the current year (for the copyright line).
 */
export function createTemplateEnv(): HandlebarsEnv {
  const hbs = Handlebars.create();
  hbs.unregisterHelper('log');
  hbs.registerHelper('eq', (...args: unknown[]) => {
    const { params } = split(args);
    return params[0] === params[1];
  });
  hbs.registerHelper('url', function (this: unknown, ...args: unknown[]) {
    const { params, options } = split(args);
    if (params.length === 0) {
      const own = isRecord(this) && Object.prototype.hasOwnProperty.call(this, 'url') ? this['url'] : '';
      return typeof own === 'string' ? own : '';
    }
    return typeof params[0] === 'string' ? langPath(params[0], langOf(options)) : '';
  });
  hbs.registerHelper('t', (...args: unknown[]) => {
    const { params, options } = split(args);
    const plain = typeof params[0] === 'string' ? params[0] : '';
    const i18n = isRecord(params[1]) ? (params[1] as I18nString) : undefined;
    return pickText(plain, i18n, langOf(options));
  });
  hbs.registerHelper('year', (...args: unknown[]) => {
    const { options } = split(args);
    const year = (options.data as Partial<RenderData> | undefined)?.year;
    return typeof year === 'number' ? year : new Date().getFullYear();
  });
  return hbs;
}

export type RenderFn = (context: unknown, data: RenderData) => string;

/** Thrown by a compiled template; `template` names the file, e.g. `sections/article.hbs`. */
export class TemplateError extends Error {
  public constructor(public readonly template: string, cause: unknown) {
    super(`${template}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/**
 * Parses `source` now (a syntax error throws a TemplateError at once) and returns a render
 * function whose runtime errors (missing helper, missing partial) also name the template.
 */
export function compileTemplate(hbs: HandlebarsEnv, name: string, source: string): RenderFn {
  let fn: Handlebars.TemplateDelegate;
  try {
    hbs.parse(source);
    fn = hbs.compile(source);
  } catch (e) {
    throw new TemplateError(name, e);
  }
  return (context, data) => {
    try {
      return fn(context, { data });
    } catch (e) {
      throw e instanceof TemplateError ? e : new TemplateError(name, e);
    }
  };
}

/** Escapes text for an XML element or a double-quoted attribute. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
