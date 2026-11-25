// apps/functions/src/email/mail-page/mail-page.logic.ts
//
// Pure rules around a Versand mail page (spec 1.172): who may render it
// and when an unsent draft is reaped.
import type { MailPageModel } from '@okr/shared-models';

import type { MailPageErrorCode } from './render-mail-page.logic';

/** Why this caller cannot render the page, or `undefined` when it is their own unsent draft. */
export function mailPageRefusal(
  page: MailPageModel | undefined,
  caller: { tenantId: string; uid: string },
): MailPageErrorCode | undefined {
  if (!page) return 'not-found';
  if (!page.tenants?.includes(caller.tenantId) || page.senderUid !== caller.uid) return 'foreign';
  if (page.mailingKey) return 'sent';
  return undefined;
}

/** Drafts live this many days since their last edit (spec 1.176 §8.5; 7 before). */
export const MAIL_PAGE_DRAFT_DAYS = 30;

/**
 * A draft (never sent) is reaped nightly once `days` days passed since its last edit: `changedAt`, else
 * `createdAt` (also when `changedAt` is not a date). A page without a readable date is never reaped.
 */
export function isReapableDraft(page: MailPageModel, nowIso: string, days = MAIL_PAGE_DRAFT_DAYS): boolean {
  if (page.mailingKey) return false;
  const changed = page.changedAt ? Date.parse(page.changedAt) : Number.NaN;
  const last = Number.isNaN(changed) ? Date.parse(page.createdAt) : changed;
  if (Number.isNaN(last)) return false;
  return Date.parse(nowIso) - last > days * 86_400_000;
}
