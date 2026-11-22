// apps/functions/src/email/mail-page/mail-page.logic.ts
//
// Pure rules around a Versand mail page (spec 1.171): who may render it, which events an events section lists,
// and when an unsent draft is reaped.
import type { CalEventModel, MailPageModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, formatExportTime } from '@okr/shared-util-core';

import type { MailEventLine, MailPageErrorCode } from './render-mail-page.logic';

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

/**
 * The next `max` events from `today` (StoreDate) on, soonest first. Archived events and past days are dropped.
 * Dates read `dd.MM.yyyy`, times `HH:mm`; the place is the first location's label, else its name.
 */
export function upcomingEventLines(events: CalEventModel[], today: string, max: number): MailEventLine[] {
  return events
    .filter((e) => !e.isArchived && e.startDate >= today)
    .sort((a, b) => `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`))
    .slice(0, Math.max(0, max))
    .map((e) => {
      const loc = e.locations?.[0];
      return {
        date: convertDateFormatToString(e.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false),
        time: formatExportTime(e.startTime),
        title: e.name,
        place: loc ? (loc.label || loc.name1 || loc.name2 || '') : '',
      };
    });
}

/** A draft (never sent) older than `days` days is reaped nightly. */
export function isReapableDraft(page: MailPageModel, nowIso: string, days = 7): boolean {
  if (page.mailingKey) return false;
  const created = Date.parse(page.createdAt);
  if (Number.isNaN(created)) return false;
  return Date.parse(nowIso) - created > days * 86_400_000;
}
