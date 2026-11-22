// apps/functions/src/email/mail-page/render-mail-page.logic.ts
//
// Renders the sections of a mail page into the content HTML of a Versand mail (spec 1.171 §7.4). Pure:
// the caller reads the page and its sections, loads the event lines and passes Handlebars and the sanitizer.
// The result goes into the layout's `{{{content}}}` slot exactly like a typed `body`.
import type { MailSectionType } from '@okr/shared-models';
import { EVENTS_CONFIG_SHAPE, MAIL_SECTION_TYPES } from '@okr/shared-models';
import { IMGIX_BASE, safeSiteUrl, toImgixUrl, type SectionDoc } from '@okr/cms-website-render';

import { MAIL_SECTION_TEMPLATES } from './mail-section-templates';

type HandlebarsEnv = typeof import('handlebars');

/** One calendar event as an events section lists it; the strings are already formatted for the reader. */
export interface MailEventLine { date: string; time: string; title: string; place: string }

export type MailPageErrorCode = 'unknown-section-type' | 'no-content' | 'not-found' | 'foreign' | 'sent';

/** Why a mail page cannot be rendered or sent. `sendMailing` turns it into a clear refusal. */
export class MailPageError extends Error {
  public constructor(message: string, public readonly code: MailPageErrorCode) {
    super(message);
    this.name = 'MailPageError';
  }
}

/** A section document of a mail page; `okey` is its document id, as listed in the page's section order. */
export type MailSection = SectionDoc & { okey?: string };

export interface MailRenderContext {
  hb: HandlebarsEnv;
  /** `sanitizeEmailBody` in production — the same policy `composeBody` applies to the whole body. */
  sanitize: (html: string) => Promise<string>;
  /** the upcoming event lines per calendar (`section.name`), at least MAX_MAIL_EVENTS when there are; each section takes its `mailEventLimit` */
  events: Record<string, MailEventLine[]>;
}

/** The most events one events section lists in a mail, whatever its `maxEvents` says. */
export const MAX_MAIL_EVENTS = 10;

/**
 * How many events an events section lists in a mail: its `properties.maxEvents` when that is a number of 1 or
 * more (rounded down), else the model default (`EVENTS_CONFIG_SHAPE.maxEvents`); never more than MAX_MAIL_EVENTS.
 * On the website an unset or 0 `maxEvents` means «all»; a mail has no «all», so it falls back to the default.
 */
export function mailEventLimit(properties: unknown): number {
  const raw = rec(properties)['maxEvents'];
  const wanted = typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : EVENTS_CONFIG_SHAPE.maxEvents;
  return Math.min(wanted, MAX_MAIL_EVENTS);
}

/** The width the layout gives the content; article images are fetched at this width. */
const MAIL_IMAGE_WIDTH = 600;

/** The sanitizer prepends this to every <p>; a fragment sanitized twice would carry it twice. */
const P_MARGIN_REPEAT = /(margin:0 0 16px;)+(?=margin:0 0 16px)/g;

function isMailSectionType(type: unknown): type is MailSectionType {
  return typeof type === 'string' && (MAIL_SECTION_TYPES as readonly string[]).includes(type);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? v as Record<string, unknown> : {};
}

/** True when sanitized html shows anything: text other than whitespace, or an image. */
function hasVisibleContent(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ');
  return text.trim().length > 0;
}

/** An image path as an absolute https URL at mail width; `''` when there is none. */
export function mailImageUrl(path: string): string {
  const url = toImgixUrl(path);
  if (url.startsWith(`${IMGIX_BASE}/`)) return `${url}${url.includes('?') ? '&' : '?'}w=${MAIL_IMAGE_WIDTH}`;
  return url.startsWith('https://') ? url : '';
}

/** A button target a mail client can open: https, mailto or tel. Relative site paths mean nothing in a mail. */
export function mailButtonUrl(raw: unknown): string {
  const url = safeSiteUrl(raw);
  return /^(https:\/\/|mailto:|tel:)/.test(url) ? url : '';
}

interface RenderedPart { html: string; hasContent: boolean }

async function renderArticle(s: MailSection, ctx: MailRenderContext, tpl: HandlebarsTemplate): Promise<RenderedPart> {
  const html = await ctx.sanitize(s.content?.htmlContent ?? '');
  const shownHtml = hasVisibleContent(html) ? html : '';
  const images = rec(s.properties)['images'];
  const first = Array.isArray(images) ? rec(images[0]) : undefined;
  const image = first
    ? { src: mailImageUrl(str(first['url'])), alt: str(first['altText']) || str(first['label']) }
    : undefined;
  // an image without a path shows its alt text (design §8); without either it shows nothing
  const shownImage = image && (image.src || image.alt) ? image : undefined;
  const title = str(s.title);
  const subTitle = str(s.subTitle);
  const hasContent = !!(shownHtml || shownImage || title || subTitle);
  return { html: hasContent ? tpl({ title, subTitle, html: shownHtml, image: shownImage }) : '', hasContent };
}

function renderButton(s: MailSection, tpl: HandlebarsTemplate): RenderedPart {
  const props = rec(s.properties);
  const url = mailButtonUrl(rec(props['action'])['url']);
  const label = str(rec(props['style'])['label']) || str(rec(props['action'])['altText']);
  if (!url || !label) return { html: '', hasContent: false };
  return { html: tpl({ url, label }), hasContent: true };
}

function renderEvents(s: MailSection, ctx: MailRenderContext, tpl: HandlebarsTemplate): RenderedPart {
  const lines = (ctx.events[str(s.name)] ?? []).slice(0, mailEventLimit(s.properties));
  if (lines.length === 0) return { html: '', hasContent: false };
  return { html: tpl({ title: str(s.title), lines }), hasContent: true };
}

type HandlebarsTemplate = (data: unknown) => string;

/**
 * The content HTML of a mail page: its sections in `order` (the page's section keys), each through its email
 * template, joined and sanitized with the mail policy. Keys without a section document and archived sections
 * are left out. Refuses a section type without an email template (`unknown-section-type`, never skipped) and a
 * page that shows nothing (`no-content`).
 */
export async function renderMailPageContent(order: string[], sections: MailSection[], ctx: MailRenderContext): Promise<string> {
  const byKey = new Map(sections.filter(s => s.okey).map(s => [s.okey as string, s]));
  const ordered = order.map(key => byKey.get(key)).filter((s): s is MailSection => !!s && !s.isArchived);

  for (const s of ordered) {
    if (!isMailSectionType(s.type)) {
      throw new MailPageError(`Section ${s.okey} has type ${String(s.type)}, which has no email template`, 'unknown-section-type');
    }
  }

  const compiled = new Map<MailSectionType, HandlebarsTemplate>();
  const templateOf = (type: MailSectionType): HandlebarsTemplate => {
    let tpl = compiled.get(type);
    if (!tpl) {
      tpl = ctx.hb.compile(MAIL_SECTION_TEMPLATES[type], { strict: false });
      compiled.set(type, tpl);
    }
    return tpl;
  };

  const parts: RenderedPart[] = [];
  for (const s of ordered) {
    const type = s.type as MailSectionType;
    if (type === 'article') parts.push(await renderArticle(s, ctx, templateOf(type)));
    else if (type === 'button') parts.push(renderButton(s, templateOf(type)));
    else parts.push(renderEvents(s, ctx, templateOf(type)));
  }

  if (!parts.some(p => p.hasContent)) throw new MailPageError('The mail page has no content', 'no-content');

  // One more pass over the whole: the output is in the sanitizer's own form, so composeBody's pass changes
  // nothing but the <p> margin, and nothing a template or a value produced can get past the mail policy.
  const html = await ctx.sanitize(parts.map(p => p.html).filter(h => h).join('\n'));
  return html.replace(P_MARGIN_REPEAT, '');
}
