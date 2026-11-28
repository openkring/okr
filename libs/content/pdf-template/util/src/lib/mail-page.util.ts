// libs/content/pdf-template/util/src/lib/mail-page.util.ts
//
// Pure helpers for the mail page of a Versand (specs 1.172, 1.176): the draft page, its meta, whether the composer loads the mail
// editor, and the readable refusals of the server's mail page rendering and of the test mail.
import { EmailLayoutChoice, MailPageModel } from '@okr/shared-models';

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

/** The i18n key (EMAIL_COMPOSER_I18N_KEYS) of a refusal of the server's mail page rendering. */
export type MailPageRefusalKey =
  | 'page_refused_no_content' | 'page_refused_sent' | 'page_refused_gone' | 'page_refused_section'
  | 'page_refused_block_type' | 'page_refused_block' | 'page_refused_too_large' | 'page_refused_letter_picture';

const MAIL_PAGE_REFUSALS: Readonly<Record<string, MailPageRefusalKey>> = {
  'no-content': 'page_refused_no_content',
  sent: 'page_refused_sent',
  'not-found': 'page_refused_gone',
  foreign: 'page_refused_gone',
  'unknown-section-type': 'page_refused_section',
  // spec 1.176 §9.1: a block the server cannot render refuses the send, never drawn as nothing
  'unknown-block-type': 'page_refused_block_type',
  'invalid-block': 'page_refused_block',
  'too-large': 'page_refused_too_large',
  // §9.4: a picture the letters cannot take (of another host, or too many)
  'letter-picture': 'page_refused_letter_picture',
};

/** Code (without the `functions/` prefix) and message of a callable error; empty when it is none. */
function callableRefusal(err: unknown): { code: string; message: string; details: unknown } {
  const e = err as { code?: unknown; message?: unknown; details?: unknown } | null | undefined;
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  return { code, message: typeof e?.message === 'string' ? e.message : '', details: e?.details };
}

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * The message key for a callable error that refuses a mail page (`sendMailing`, `renderEmailPreview`, `quoteMailingLetters`,
 * `sendTestMailing`): the server throws `failed-precondition` with the page's code as message (`no-content`, `sent`, `not-found`,
 * `foreign`, `unknown-section-type`, `unknown-block-type`, `invalid-block`, `too-large`, `letter-picture`). Anything else is undefined:
 * the caller keeps its own error handling.
 */
export function mailPageRefusalKey(err: unknown): MailPageRefusalKey | undefined {
  const { code, message } = callableRefusal(err);
  if (code !== 'failed-precondition' || !hasOwn(MAIL_PAGE_REFUSALS, message)) return undefined;
  return MAIL_PAGE_REFUSALS[message];
}

/** The block a page refusal names (`details.blockId`), so that the composer can select it; undefined when there is none. */
export function mailPageRefusalBlockId(err: unknown): string | undefined {
  if (!mailPageRefusalKey(err)) return undefined;
  const { details } = callableRefusal(err);
  const blockId = details && typeof details === 'object' ? (details as { blockId?: unknown }).blockId : undefined;
  return typeof blockId === 'string' && blockId !== '' ? blockId : undefined;
}

/**
 * A picture the letters cannot take (§9.4): `quoteMailingLetters` answers `unavailable`, `sendMailing` `failed-precondition`, both with
 * `letter-picture`. It must not be read as «Pingen is not available»: once the picture is fixed, Post is possible again.
 */
export function isLetterPictureRefusal(err: unknown): boolean {
  const { code, message } = callableRefusal(err);
  return message === 'letter-picture' && (code === 'unavailable' || code === 'failed-precondition');
}

/** The i18n key of a refusal of «Testmail senden» (`sendTestMailing`, spec 1.176 §8.4). */
export type TestMailRefusalKey = 'test_no_address' | 'test_impersonated' | 'test_provider' | 'test_permission' | MailPageRefusalKey;

const TEST_MAIL_REFUSALS: Readonly<Record<string, Readonly<Record<string, TestMailRefusalKey>>>> = {
  'failed-precondition': { 'no-address': 'test_no_address', impersonated: 'test_impersonated' },
  unavailable: { provider: 'test_provider' },
};

/**
 * The message key of a refused test mail: its own refusals, else those of the page; undefined for anything else. Every
 * `permission-denied` (role, group, tenant or answer links lost since the composer opened) is one text: its server message is technical.
 */
export function testMailRefusalKey(err: unknown): TestMailRefusalKey | undefined {
  const { code, message } = callableRefusal(err);
  if (code === 'permission-denied') return 'test_permission';
  const own = hasOwn(TEST_MAIL_REFUSALS, code) ? TEST_MAIL_REFUSALS[code] : undefined;
  if (own && hasOwn(own, message)) return own[message];
  return mailPageRefusalKey(err);
}

/** The width of the preview (spec 1.176 §8.4): a phone is 390 px wide, the desktop takes the window. */
export const PREVIEW_MOBILE_WIDTH = 390;
export type PreviewWidth = 'mobile' | 'desktop';
