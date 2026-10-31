import { CalEventModel, InvitationModel } from '@okr/shared-models';

import { isCaleventAttendanceClosed } from './calevent-attendance.util';
import { DateFormat, getTodayStr, isPastDate } from './date.util';

/**
 * An invitation is "open" when the signed-in person still owes an answer: it is addressed to them,
 * has not been answered (`pending`) and its event has not happened yet.
 *
 * This is the single source of truth for both the invitations widget (scope `open`) and the
 * notification badge (`AppStore.openInvitationCount`) — the two used to be able to disagree.
 *
 * Note that today's events still count as open: the answer is due right up to the event, so
 * `isPastDate` (yesterday and earlier) is the cut-off, not `isAfterDate(date, today)`.
 *
 * `today` (StoreDate, here and in the functions below) defaults to the local clock. The Cloud
 * Functions run in UTC and pass their Europe/Zurich day, so the server badge counts like the app.
 */
export function isOpenInvitation(invitation: InvitationModel, personKey: string, today: string = getTodayStr(DateFormat.StoreDate)): boolean {
  if (!personKey) return false;
  return invitation.inviteeKey === personKey
    && invitation.state === 'pending'
    && !invitation.isArchived
    && !isPastDate(invitation.date, DateFormat.StoreDate, today);
}

/** The subset of {@link invitations} that is open for the given person. */
export function openInvitationsOf(invitations: InvitationModel[], personKey: string): InvitationModel[] {
  return invitations.filter(inv => isOpenInvitation(inv, personKey));
}

/**
 * An invitation is "countable" when the person can actually answer it: it is open
 * ({@link isOpenInvitation}), not locked, and — if it belongs to an event — that event still exists,
 * is not archived and still takes answers (not over, locked or cancelled,
 * {@link isCaleventAttendanceClosed}).
 *
 * The one rule behind the app-icon badge (`AppStore.openInvitationCount`), the dashboard invitations
 * card and the invitation push gate (`shouldNotifyInvitation` in the functions, which mirrors it).
 *
 * `event` is the invitation's calevent: `null` when the doc does not exist (deleted), `undefined`
 * when it is not loaded yet. Both make an invitation WITH a `caleventKey` not countable — a deleted
 * event cannot be answered, and while loading we rather show too few than a transient too-high badge.
 * An invitation without `caleventKey` does not depend on an event and stays countable.
 */
export function isCountableInvitation(
  invitation: InvitationModel,
  personKey: string,
  event: CalEventModel | null | undefined,
  today: string = getTodayStr(DateFormat.StoreDate),
): boolean {
  if (!isOpenInvitation(invitation, personKey, today) || invitation.isLocked) return false;
  if (!invitation.caleventKey) return true;
  return !!event && !event.isArchived && !isCaleventAttendanceClosed(event, today);
}

/**
 * The subset of {@link invitations} that is countable for the given person; `events` maps a
 * caleventKey to its event (`null` = deleted). A key missing from the map counts as not loaded yet.
 */
export function countableInvitationsOf(
  invitations: InvitationModel[],
  personKey: string,
  events: Map<string, CalEventModel | null>,
  today: string = getTodayStr(DateFormat.StoreDate),
): InvitationModel[] {
  return invitations.filter(inv => isCountableInvitation(inv, personKey, inv.caleventKey ? events.get(inv.caleventKey) : undefined, today));
}
