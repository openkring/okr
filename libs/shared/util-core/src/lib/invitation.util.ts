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

/**
 * Whom to actually invite when the organiser invites a whole group: every member except the
 * organiser themselves and everyone who already holds an invitation for this event. Without the
 * second filter, re-running "invite group members" after a new member joined duplicated the
 * invitation of everyone already invited.
 *
 * @param memberKeys       person keys of all group members
 * @param existing         invitations that already exist for the event being invited to
 * @param currentPersonKey person key of the inviting user, excluded from the result
 */
export function inviteeCandidates(memberKeys: string[], existing: InvitationModel[], currentPersonKey: string): string[] {
  const invited = new Set(existing.map(inv => inv.inviteeKey));
  return memberKeys.filter(key => !!key && key !== currentPersonKey && !invited.has(key));
}
