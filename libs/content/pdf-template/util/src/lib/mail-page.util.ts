// libs/content/pdf-template/util/src/lib/mail-page.util.ts
//
// Pure helpers for the mail page of a Versand (spec 1.171): the draft page, the "does it show anything" check
// the composer needs before sending, a one-line summary per section, and the picker of addable section types.
import { CategoryItemModel, CategoryListModel, MAIL_SECTION_TYPES, MailPageModel, SectionModel } from '@okr/shared-models';

const SUMMARY_LENGTH = 60;

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

/** A button target a mail client can open: https, mailto or tel (the server's `mailButtonUrl` rule). */
function isSafeMailUrl(raw: unknown): boolean {
  const u = str(raw);
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(u)) return false;
  return /^(https:\/\/|mailto:|tel:)/.test(u);
}

function sectionHasContent(s: SectionModel): boolean {
  const props = rec(s.properties);
  switch (s.type) {
    case 'article': {
      const html = s.content?.htmlContent ?? '';
      const images = props['images'];
      const first = Array.isArray(images) ? rec(images[0]) : undefined;
      const hasImage = !!first && !!(str(first['url']) || str(first['altText']) || str(first['label']));
      return /<img\b/i.test(html) || visibleText(html).length > 0 || hasImage || !!str(s.title) || !!str(s.subTitle);
    }
    case 'button':
      return isSafeMailUrl(rec(props['action'])['url']) && !!(str(rec(props['style'])['label']) || str(rec(props['action'])['altText']));
    case 'events':
      return !!str(s.name);
    default:
      return false;
  }
}

/**
 * Whether the page shows anything, by the rule of the server's `no-content` (`renderMailPageContent`): an article
 * with visible text or an image, a button with a safe (https/mailto/tel) URL and a label, an events section.
 * Archived sections do not count. The server counts an events section only when its calendar yields event
 * lines, which it loads; the client cannot know that, so an events section with a calendar name is enough here.
 */
export function mailPageHasContent(sections: SectionModel[]): boolean {
  return sections.some(s => !s.isArchived && sectionHasContent(s));
}

/** One line for the section list: an article's first 60 visible characters, a button's label, an events calendar. */
export function sectionSummary(section: SectionModel): string {
  const props = rec(section.properties);
  switch (section.type) {
    case 'article': {
      const text = visibleText(section.content?.htmlContent ?? '').replace(/\s+/g, ' ');
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
