// apps/functions/src/email/mail-page/mail-content.ts
//
// What one Versand sends, from one read of its mail page (spec 1.176 §9.2–9.4): the html of the mail, and, only for a page
// with blocks, the html of its letters and the blocks of its Mitteilung. Pure; a page without blocks gives what it gave before.
import type { ArticleBlock } from '@okr/shared-models';

import { MAX_MAIL_BLOCKS, noticeBlocks, renderMailBlocks } from './render-mail-blocks.logic';
import {
  joinMailParts, MailPageError, mailSectionRenderer, orderedMailSections, P_MARGIN_REPEAT, renderMailPageContent,
  type MailRenderContext, type MailSection, type RenderedPart,
} from './render-mail-page.logic';

export interface MailContent {
  /** what the mail, the web version and `mailings.body` hold */
  html: string;
  /** only of a page with blocks: what the letters print instead of `html` */
  letterHtml?: string;
  /** only of a page with blocks: what the Mitteilung draws instead of `html` */
  notice?: ArticleBlock[];
}

/** The document `mailings/{key}/content/sent` of a Versand whose page has blocks. Server only. */
export interface SentContent {
  letterBody: string;
  noticeBlocks: ArticleBlock[];
}

/**
 * The most bytes of a mail's html, and of `content/sent` as JSON. Firestore takes 1 MiB per document; the rest is for what
 * else stands in it (recipients, layout).
 */
export const MAX_CONTENT_BYTES = 900_000;

/** The blocks of a mail section as stored; undefined for a section that renders the old way. */
function storedBlocks(section: MailSection): unknown[] | undefined {
  if (section.type !== 'article') return undefined;
  const blocks = (section.properties as { blocks?: unknown } | null | undefined)?.blocks;
  return Array.isArray(blocks) ? blocks : undefined;
}

/** The calendars whose events the page lists: of its events sections (`name`) and events blocks (`calendarKey`). */
export function mailCalendarKeys(sections: MailSection[]): string[] {
  const keys = new Set<string>();
  for (const section of sections) {
    if (section.type === 'events' && section.name) keys.add(section.name);
    // the renderer refuses more blocks, so there is nothing to load for them
    for (const block of (storedBlocks(section) ?? []).slice(0, MAX_MAIL_BLOCKS) as ({ type?: unknown; calendarKey?: unknown } | null)[]) {
      const key = block?.type === 'events' && typeof block.calendarKey === 'string' ? block.calendarKey.trim() : '';
      if (key && !key.includes('/')) keys.add(key);
    }
  }
  return [...keys];
}

/** What the letters print. */
export function letterBodyOf(content: Pick<MailContent, 'html' | 'letterHtml'>): string {
  return content.letterHtml ?? content.html;
}

/** What is stored beside the mailing; undefined for a page without blocks. */
export function sentContentOf(content: MailContent): SentContent | undefined {
  if (content.letterHtml === undefined || content.notice === undefined) return undefined;
  return { letterBody: content.letterHtml, noticeBlocks: content.notice };
}

function bytesOf(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** The content when it fits into the documents it is stored in, else `too-large`: before any money moves or file is stored. */
function checkedSize(content: MailContent): MailContent {
  const sent = sentContentOf(content);
  // a Mitteilung holds the html and the blocks
  const sizes = [bytesOf(content.html), ...(sent ? [bytesOf(JSON.stringify(sent)), bytesOf(content.html) + bytesOf(JSON.stringify(sent.noticeBlocks))] : [])];
  if (sizes.some((size) => size > MAX_CONTENT_BYTES)) throw new MailPageError(`The content of the mail has ${Math.max(...sizes)} bytes`, 'too-large');
  return content;
}

/**
 * The content of a mail page, its sections in `order`: an article with blocks through the block renderer, every other section
 * as before. An old section beside blocks keeps its html in the letter and becomes a text of the Mitteilung. Refuses with a
 * `MailPageError` what cannot be rendered, a page that shows nothing (`no-content`), and one too long to store (`too-large`).
 */
export async function renderMailContent(order: string[], sections: MailSection[], ctx: MailRenderContext & { color: string }): Promise<MailContent> {
  const ordered = orderedMailSections(order, sections);
  if (!ordered.some((section) => storedBlocks(section))) return checkedSize({ html: await renderMailPageContent(order, sections, ctx) });

  const renderSection = mailSectionRenderer(ctx);
  const mail: RenderedPart[] = [];
  const letter: RenderedPart[] = [];
  const notice: ArticleBlock[] = [];
  for (const section of ordered) {
    const blocks = storedBlocks(section);
    if (blocks) {
      mail.push(await renderMailBlocks(blocks, { ...ctx, target: 'mail' }));
      letter.push(await renderMailBlocks(blocks, { ...ctx, target: 'print' }));
      notice.push(...await noticeBlocks(blocks, ctx));
    } else {
      const part = await renderSection(section);
      mail.push(part);
      letter.push(part);
      const html = (await ctx.sanitize(part.html)).replace(P_MARGIN_REPEAT, '');
      if (html) notice.push({ id: String(section.okey), type: 'text', html });
    }
  }
  return checkedSize({ html: await joinMailParts(mail, ctx), letterHtml: await joinMailParts(letter, ctx), notice });
}
