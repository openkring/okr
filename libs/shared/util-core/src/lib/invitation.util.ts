import { InvitationModel } from '@okr/shared-models';

import { isPastDate } from './date.util';

/**
 * An invitation is "open" when the signed-in person still owes an answer: it is addressed to them,
 * has not been answered (`pending`) and its event has not happened yet.
 *
 * This is the single source of truth for both the invitations widget (scope `open`) and the
 * notification badge (`AppStore.openInvitationCount`) — the two used to be able to disagree.
 *
 * Note that today's events still count as open: the answer is due right up to the event, so
 * `isPastDate` (yesterday and earlier) is the cut-off, not `isAfterDate(date, today)`.
 */
export function isOpenInvitation(invitation: InvitationModel, personKey: string): boolean {
  if (!personKey) return false;
  return invitation.inviteeKey === personKey
    && invitation.state === 'pending'
    && !invitation.isArchived
    && !isPastDate(invitation.date);
}

/** The subset of {@link invitations} that is open for the given person. */
export function openInvitationsOf(invitations: InvitationModel[], personKey: string): InvitationModel[] {
  return invitations.filter(inv => isOpenInvitation(inv, personKey));
}
