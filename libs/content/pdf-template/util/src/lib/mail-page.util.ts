// libs/content/pdf-template/util/src/lib/mail-page.util.ts
//
// Pure helpers for the mail page of a Versand (spec 1.172): the draft page, the "does it show anything" check
// the composer needs before sending, a one-line summary per section, and the picker of addable section types.
import { CategoryItemModel, CategoryListModel, EmailLayoutChoice, MAIL_SECTION_TYPES, MailPageModel, SectionModel } from '@okr/shared-models';

const SUMMARY_LENGTH = 60;

/** What the draft page keeps of the composer besides its blocks (spec 1.176 §8.5): written with them, read by «Frühere E-Mail kopieren». */
export interface MailPageMeta {
  subject: string;
  layout: EmailLayoutChoice;
  webVersion: boolean;
}

export function sameMailPageMeta(a: MailPageMeta, b: MailPageMeta): boolean {
  return a.subject === b.subject && a.layout === b.layout && a.webVersion === b.webVersion;
}

/**
 * Whether the composer loads the mail editor (spec 1.176 §10): only a Versand, only in its «Editor» segment, and only once its draft
 * exists. Every other use of the composer keeps the text editor and never asks for the editor's chunk.
 */
export function mailEditorWanted(state: { isVersand: boolean; segment: string; draftLoaded: boolean; hasLoader: boolean }): boolean {
  return state.isVersand && state.segment === 'editor' && state.draftLoaded && state.hasLoader;
}

/**
 * A draft page for `uid`. `createdAt` is always set: the nightly reap of abandoned drafts queries
 * `createdAt < cutoff`, so a draft without it would never be cleaned up. `mailingKey` is never written by the
 * client (the rules refuse it), and `groupKey` is only set for a group admin sending for that group.
 */
export function newMailPage(tenantId: string, uid: string, groupKey?: string): MailPageModel {
  const page = new MailPageModel(tenantId);
  page.senderUid = uid;
  page.createdAt = new Date().toISOString();
  delete page.mailingKey;
  if (groupKey) page.groupKey = groupKey;
  return page;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? v as Record<string, unknown> : {};
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').trim();
}

/** A button target a mail client can open: https, mailto, tel or an app path (the server's `mailButtonUrl` rule). */
function isSafeMailUrl(raw: unknown): boolean {
  const u = str(raw);
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(u)) return false;
  return /^(https:\/\/|mailto:|tel:|\/(?!\/))/.test(u);
}

/**
 * Whether an article image path becomes an image in the mail, as the server's `mailImageUrl` resolves it: an
 * https URL is kept, any other non-empty path is a Storage path served through imgix, and an `http://` URL is
 * dropped (`toImgixUrl` keeps it as is, and the mail takes https only).
 */
function isMailImagePath(raw: unknown): boolean {
  const path = str(raw);
  return path.length > 0 && !path.startsWith('http://');
}

function sectionHasContent(s: SectionModel): boolean {
  const props = rec(s.properties);
  switch (s.type) {
    case 'article': {
      const html = s.content?.htmlContent ?? '';
      const images = props['images'];
      const first = Array.isArray(images) ? rec(images[0]) : undefined;
      // the server shows the first image when its path resolves, else its alt text (altText, else label)
      const hasImage = !!first && (isMailImagePath(first['url']) || !!(str(first['altText']) || str(first['label'])));
      const cta = rec(props['cta']);
      const hasButton = !!str(cta['label']) && isSafeMailUrl(cta['url']);
      return /<img\b/i.test(html) || visibleText(html).length > 0 || hasImage || hasButton
        || !!str(s.title) || !!str(s.subTitle) || !!str(s.intro);
    }
    case 'button':
      return isSafeMailUrl(rec(props['action'])['url']) && !!(str(rec(props['style'])['label']) || str(rec(props['action'])['altText']));
    default:
      // an events section is not counted (see mailPageHasContent); any other type has no email template
      return false;
  }
}

/**
 * Whether the page shows anything, by the rule of the server's `no-content` (`renderMailPageContent`): an article
 * with visible text, a title, an intro, an image (a path the server resolves, or an alt text) or a button, or a
 * button section; a button counts with a label and a URL a mail can open (https, mailto, tel or an app path). Archived sections do not count.
 *
 * An events section never makes a page sendable here: the server counts it only when its calendar has upcoming
 * events, which the client does not load. So a page needs an article or a button; events alone are refused
 * before the send. Where the two still differ (an events section next to an empty article, a calendar that is
 * empty after all), the server's `no-content` is the backstop and the composer shows it as a readable message.
 */
export function mailPageHasContent(sections: SectionModel[]): boolean {
  return sections.some(s => !s.isArchived && sectionHasContent(s));
}

/** The i18n key (EMAIL_COMPOSER_I18N_KEYS) of a refusal of the server's mail page rendering. */
export type MailPageRefusalKey = 'page_refused_no_content' | 'page_refused_sent' | 'page_refused_gone' | 'page_refused_section';

const MAIL_PAGE_REFUSALS: Readonly<Record<string, MailPageRefusalKey>> = {
  'no-content': 'page_refused_no_content',
  sent: 'page_refused_sent',
  'not-found': 'page_refused_gone',
  foreign: 'page_refused_gone',
  'unknown-section-type': 'page_refused_section',
};

/**
 * The message key for a callable error that refuses a mail page (`sendMailing`, `renderEmailPreview`,
 * `quoteMailingLetters`): the server throws `failed-precondition` with the page's code as message
 * (`no-content`, `sent`, `not-found`, `foreign`, `unknown-section-type`). Anything else is undefined: the caller
 * keeps its own error handling.
 */
export function mailPageRefusalKey(err: unknown): MailPageRefusalKey | undefined {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  if (code !== 'failed-precondition' || typeof e?.message !== 'string') return undefined;
  return Object.prototype.hasOwnProperty.call(MAIL_PAGE_REFUSALS, e.message) ? MAIL_PAGE_REFUSALS[e.message] : undefined;
}

/** One line for the section list: an article's first 60 visible characters (else its intro or button label), a button's label, an events calendar. */
export function sectionSummary(section: SectionModel): string {
  const props = rec(section.properties);
  switch (section.type) {
    case 'article': {
      const text = (visibleText(section.content?.htmlContent ?? '') || str(section.intro) || str(rec(props['cta'])['label'])).replace(/\s+/g, ' ');
      return text.length > SUMMARY_LENGTH ? text.slice(0, SUMMARY_LENGTH) : text;
    }
    case 'button':
      return str(rec(props['style'])['label']) || str(rec(props['action'])['altText']);
    case 'events':
      return str(section.name);
    default:
      return '';
  }
}

/** The picker input for «Sektion hinzufügen»: the section types a mail page can hold, as the journal builds it. */
export function mailSectionCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = 'section_type';
  category.i18n = '@cms/section/feature.section_type';
  category.items = MAIL_SECTION_TYPES.map(t => new CategoryItemModel(t, t));
  return category;
}
