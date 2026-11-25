// apps/functions/src/email/mail-page/mail-content.ts
//
// What one Versand sends, from one read of its mail page (spec 1.176 §9.2–9.4): the html of the mail, and, only for a page
// with blocks, the html of its letters and the blocks of its Mitteilung. Pure; a page without blocks gives what it gave before.
import type { ArticleBlock } from '@okr/shared-models';

import { MAX_PERSONAL_RECIPIENTS } from '../personal-mail.logic';
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

/** The most bytes of the html of a mail with blocks, and of its `content/sent` as JSON. */
export const MAX_CONTENT_BYTES = 900_000;

/** The most bytes of the long parts of one document; Firestore takes 1 MiB (1 048 576), the rest is for its other fields. */
export const MAX_DOCUMENT_BYTES = 1_000_000;

/** Room for the recipients of a Mitteilung: 3000 person keys, the most a Versand has. */
const NOTICE_RECIPIENTS_BYTES = 120_000;

/** The blocks of a mail section as stored; undefined for a section that renders the old way. */
function storedBlocks(section: MailSection): unknown[] | undefined {
  if (section.type !== 'article') return undefined;
  const blocks = (section.properties as { blocks?: unknown } | null | undefined)?.blocks;
  return Array.isArray(blocks) ? blocks : undefined;
}

/** The calendars whose events the sections list: of events sections (`name`) and events blocks (`calendarKey`). Values to compare, never paths. */
export function mailCalendarKeys(sections: MailSection[]): string[] {
  const keys = new Set<string>();
  for (const section of sections) {
    if (section.type === 'events' && section.name) keys.add(section.name);
    // the renderer refuses more blocks, so there is nothing to load for them
    for (const block of (storedBlocks(section) ?? []).slice(0, MAX_MAIL_BLOCKS) as ({ type?: unknown; calendarKey?: unknown } | null)[]) {
      const key = block?.type === 'events' && typeof block.calendarKey === 'string' ? block.calendarKey.trim() : '';
      if (key) keys.add(key);
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

function jsonBytesOf(value: unknown): number {
  return bytesOf(JSON.stringify(value));
}

/** About the most bytes of one entry of a personal mail job: the address, and each link with its field (the unsubscribe link also in the headers). */
export function personalEntryBytes(links: { answer: boolean; unsubscribe: boolean }): number {
  return 80 + (links.answer ? 210 : 0) + (links.unsubscribe ? 480 : 0);
}

/**
 * Whether a Versand with this body fits into the documents that hold it: the mailing (with its deliveries, and the recipients of
 * a Pingen order), and, for mails with personal links, a mail job with its entries.
 */
export function fitsDocuments(body: string, send: {
  deliveries: readonly unknown[]; postKeys: readonly string[]; personal?: { entries: number; answer: boolean; unsubscribe: boolean };
}): boolean {
  const mailing = jsonBytesOf(send.deliveries) + (send.postKeys.length > 0 ? jsonBytesOf(send.postKeys) : 0);
  const job = send.personal ? Math.min(send.personal.entries, MAX_PERSONAL_RECIPIENTS) * personalEntryBytes(send.personal) : 0;
  return bytesOf(body) + Math.max(mailing, job) <= MAX_DOCUMENT_BYTES;
}

/** The content of a page with blocks when it can be stored, else `too-large`: before any money moves or file is stored. */
async function checkedSize(content: Required<MailContent>, ctx: Pick<MailRenderContext, 'sanitize'>): Promise<MailContent> {
  const sent = sentContentOf(content);
  // a Mitteilung holds the html, sanitized once more, the blocks and its recipients
  const notice = bytesOf(await ctx.sanitize(content.html)) + jsonBytesOf(content.notice) + NOTICE_RECIPIENTS_BYTES;
  if (bytesOf(content.html) > MAX_CONTENT_BYTES || jsonBytesOf(sent) > MAX_CONTENT_BYTES || notice > MAX_DOCUMENT_BYTES) {
    throw new MailPageError('The content of the mail is too long to store', 'too-large');
  }
  return content;
}

/** The blocks with ids of their own, also in columns: the sections of a page may carry the same ones. */
function withUniqueIds<T extends ArticleBlock>(blocks: T[], taken = new Map<string, number>()): T[] {
  return blocks.map((block) => {
    let id = block.id;
    // `taken` remembers the last suffix of an id, so many equal ids are not counted from the start each time
    let n = taken.get(id) ?? 1;
    while (taken.has(id)) id = `${block.id}-${++n}`;
    taken.set(block.id, n);
    if (id !== block.id) taken.set(id, 1);
    const columns = block.type === 'columns' ? { columns: block.columns.map((column) => ({ ...column, blocks: withUniqueIds(column.blocks, taken) })) } : {};
    return { ...block, id, ...columns };
  });
}

/**
 * The content of a mail page, its sections in `order`: an article with blocks through the block renderer, every other section
 * as before. An old section beside blocks keeps its html in the letter and becomes a text of the Mitteilung. Refuses with a
 * `MailPageError` what cannot be rendered, a page that shows nothing (`no-content`), and blocks too long to store (`too-large`).
 */
export async function renderMailContent(order: string[], sections: MailSection[], ctx: MailRenderContext & { color: string }): Promise<MailContent> {
  const ordered = orderedMailSections(order, sections);
  if (!ordered.some((section) => storedBlocks(section))) return { html: await renderMailPageContent(order, sections, ctx) };

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
  return checkedSize({ html: await joinMailParts(mail, ctx), letterHtml: await joinMailParts(letter, ctx), notice: withUniqueIds(notice) }, ctx);
}
