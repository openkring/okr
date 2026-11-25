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

/** A draft (never sent) older than `days` days is reaped nightly. */
export function isReapableDraft(page: MailPageModel, nowIso: string, days = 7): boolean {
  if (page.mailingKey) return false;
  const created = Date.parse(page.createdAt);
  if (Number.isNaN(created)) return false;
  return Date.parse(nowIso) - created > days * 86_400_000;
}
