// libs/content/pdf-template/util/src/lib/mail-start.util.ts
//
// The start step of a Versand (spec 1.176 §8.5): «Neu», the sender's own drafts, or «Frühere E-Mail kopieren»; and what closing the
// composer does with its draft. All functions are pure.
import type { MailPageModel } from '@okr/shared-models';

import type { MailingView } from './mailing.util';

/** At most this many own drafts are read and offered, the newest first. */
export const START_DRAFTS_MAX = 20;
/** At most this many earlier mails are shown (a search narrows them), the newest first. */
export const START_EARLIER_MAX = 50;
/** The choices that take longer to load are not offered: the composer goes on with its new draft. */
export const START_LOAD_MS = 3000;

/** An own page as the start step knows it: `hasContent` and `firstWords` once its blocks were read, else undefined. */
export interface StartPage {
  page: MailPageModel;
  hasContent?: boolean;
  firstWords?: string;
}

/** One choice of the start step: continue an own draft, or copy an earlier mail into a new draft. */
export interface StartChoice {
  kind: 'draft' | 'copy';
  pageKey: string;
  /** Empty when the page and its mailing have none: the step then shows the first words. */
  subject: string;
  firstWords: string;
  /** ms since 1970, 0 when unknown: the date shown, and the order (newest first). */
  time: number;
}

/** What the sender picked; `undefined` (closed) and `new` keep the new empty draft. */
export type StartPick = { kind: 'new' } | StartChoice;

/** A time as the app stores it: ISO, or `yyyyMMddHHmmss` (StoreDateTime, local time) as on a mailing. 0 when it is neither. */
export function storedTime(value: string | undefined): number {
  if (typeof value !== 'string' || value === '') return 0;
  const store = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (store) {
    const [, y, mo, d, h, mi, s] = store.map(Number);
    return new Date(y, mo - 1, d, h, mi, s).getTime();
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

/** The local day of a time as StoreDate (`yyyyMMdd`), for the app's date pipe; empty when unknown. */
export function storeDateOf(time: number): string {
  if (!Number.isFinite(time) || time <= 0) return '';
  const date = new Date(time);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

/** When the page was last changed: `changedAt`, else `createdAt`. */
export function pageTime(page: Pick<MailPageModel, 'changedAt' | 'createdAt'>): number {
  return storedTime(page.changedAt) || storedTime(page.createdAt);
}

function isSent(page: MailPageModel): boolean {
  return typeof page.mailingKey === 'string' && page.mailingKey !== '';
}

function ofTenant(page: MailPageModel, tenantId: string): boolean {
  return !!page?.okey && Array.isArray(page.tenants) && page.tenants.includes(tenantId);
}

const newestFirst = <T>(time: (item: T) => number) => (a: T, b: T) => time(b) - time(a);

/**
 * The own drafts worth reading (one section read each): of the tenant, unsent, not the composer's own new draft (`exceptKey`), the
 * `START_DRAFTS_MAX` newest.
 */
export function draftCandidates(pages: MailPageModel[], tenantId: string, exceptKey = ''): MailPageModel[] {
  return (Array.isArray(pages) ? pages : [])
    .filter((page) => ofTenant(page, tenantId) && !isSent(page) && page.okey !== exceptKey)
    .sort(newestFirst(pageTime))
    .slice(0, START_DRAFTS_MAX);
}

/**
 * The earlier mails, newest first, each page once, at most `START_EARLIER_MAX`:
 * - a member admin or privileged user (`mayReadMailings`): the tenant's mailings that have a page (the list they see already), with the
 *   mailing's subject when the page has none;
 * - everybody: their own sent pages of the tenant.
 * A mailing without a page (before 1.172) is not offered.
 */
export function earlierMails(pages: StartPage[], mailings: MailingView[], mayReadMailings: boolean, tenantId: string): StartChoice[] {
  const own = new Map<string, StartPage>();
  for (const entry of Array.isArray(pages) ? pages : []) {
    if (entry?.page && ofTenant(entry.page, tenantId)) own.set(entry.page.okey, entry);
  }
  const byPage = new Map<string, StartChoice>();
  if (mayReadMailings) {
    for (const mailing of Array.isArray(mailings) ? mailings : []) {
      const pageKey: unknown = mailing?.pageKey;
      if (typeof pageKey !== 'string' || pageKey === '' || pageKey.includes('/') || !mailing.tenants?.includes(tenantId)) continue;
      const page = own.get(pageKey);
      const time = storedTime(mailing.createdAt);
      const known = byPage.get(pageKey);
      if (known && known.time >= time) continue;
      byPage.set(pageKey, {
        kind: 'copy', pageKey, subject: (page?.page.subject || mailing.subject || '').trim(), firstWords: page?.firstWords ?? '', time,
      });
    }
  }
  for (const [pageKey, entry] of own) {
    if (!isSent(entry.page) || byPage.has(pageKey)) continue;
    byPage.set(pageKey, { kind: 'copy', pageKey, subject: (entry.page.subject ?? '').trim(), firstWords: entry.firstWords ?? '', time: pageTime(entry.page) });
  }
  return [...byPage.values()].sort(newestFirst((choice) => choice.time)).slice(0, START_EARLIER_MAX);
}

/**
 * The choices of the start step (§8.5): the own drafts that have content (read), newest first; and the earlier mails (`earlierMails`).
 * A draft of another tenant, a sent page, or one whose content is unknown or empty is never a draft to continue.
 */
export function startChoices(
  pages: StartPage[], mailings: MailingView[], mayReadMailings: boolean, tenantId: string, exceptKey = '',
): { drafts: StartChoice[]; earlier: StartChoice[] } {
  const entries = Array.isArray(pages) ? pages.filter((entry) => !!entry?.page) : [];
  const readable = new Map(entries.map((entry) => [entry.page.okey, entry]));
  const drafts = draftCandidates(entries.map((entry) => entry.page), tenantId, exceptKey)
    .filter((page) => readable.get(page.okey)?.hasContent === true)
    .map((page): StartChoice => ({
      kind: 'draft', pageKey: page.okey, subject: (page.subject ?? '').trim(), firstWords: readable.get(page.okey)?.firstWords ?? '', time: pageTime(page),
    }));
  return { drafts, earlier: earlierMails(entries, mailings, mayReadMailings, tenantId) };
}

/** The earlier mails among which the step needs first words: those without a subject. */
export function choicesWithoutSubject(choices: StartChoice[]): string[] {
  return choices.filter((choice) => choice.subject === '' && choice.firstWords === '').map((choice) => choice.pageKey);
}

/** The earlier mails whose subject or first words contain every word of `search` (case and accents ignored). */
export function filterStartChoices(choices: StartChoice[], search: string): StartChoice[] {
  const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = fold(search ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return choices;
  return choices.filter((choice) => {
    const text = fold(`${choice.subject} ${choice.firstWords}`);
    return words.every((word) => text.includes(word));
  });
}

/**
 * Whether the composer looks for start choices at all (§8.5): only a Versand, and never one that opens with content of its caller (a
 * prefilled body or subject) or with a document attached; it starts directly with a new draft.
 */
export function startStepWanted(state: { isVersand: boolean; bodyDefault: string; subjectDefault: string; storagePath: string; filename: string }): boolean {
  return state.isVersand && !state.bodyDefault && !state.subjectDefault && !state.storagePath && !state.filename;
}

/**
 * What a close of a Versand composer does with its draft (§8.5):
 * - `allow`: nothing to ask (no Versand, sent, or no content: the draft is deleted silently on close);
 * - `wait`: a send or a test mail runs, or a chosen draft or copy is replacing the new one (its content is not loaded yet, and the
 *   page must not be deleted by a close that saw no content); ask again once it ended;
 * - `ask`: «Entwurf behalten» / «Verwerfen» / «Zurück».
 */
export function composerCloseDecision(
  state: { isVersand: boolean; sent: boolean; busy: boolean; hasContent: boolean; picking?: boolean },
): 'allow' | 'wait' | 'ask' {
  if (!state.isVersand || state.sent) return 'allow';
  if (state.busy || state.picking) return 'wait';
  return state.hasContent ? 'ask' : 'allow';
}
