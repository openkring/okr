import { Attendee, AvatarInfo, InvitationState } from '@okr/shared-models';

/**
 * An invitation state expressed in the narrower attendee vocabulary.
 *
 * Everything that is not a clear yes or no becomes 'invited', i.e. unanswered. That covers
 * 'pending' and the retired 'maybe': the answer was binary in every user-facing path long before
 * the state was removed from the model (2026-09-14), but legacy documents still carry it and must
 * keep reading as «has not answered» rather than falling out of the list.
 */
export function toAttendeeState(state: InvitationState): Attendee['state'] {
  if (state === 'accepted') return 'accepted';
  if (state === 'declined') return 'declined';
  return 'invited';
}

/**
 * Write an invitee's answer into the event's attendee list.
 *
 * The invitation carries the ASK and the answer trail (timestamp, comment); the attendee entry
 * carries the ANSWER, and it is the only thing the participant list, the series table, the
 * participant count and the notification recipients read
 * (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 3). So every response
 * to an invitation has to land here too.
 *
 * Two rules, both inherited from the participant cap (`maxAttendees`), which is derived from ARRAY
 * ORDER — the first `maxAttendees` accepted entries are confirmed, the rest wait:
 *
 * - accepting from a non-accepted state moves the person to the END. Editing in place would let
 *   somebody who declined and changed their mind reclaim an early position and silently push a
 *   confirmed attendee onto the waiting list. Re-joining a queue means joining at the back.
 * - every other answer is written in place: neither 'declined' nor 'invited' occupies a seat, so
 *   moving them would churn the order for nothing.
 *
 * An answer reset to 'pending' (and the retired 'maybe' on legacy documents) becomes 'invited',
 * i.e. unanswered — the person is NOT removed. Dropping them would take a still-invited guest out
 * of the participant list and out of the recipients of a cancellation, which is exactly the person
 * who would otherwise turn up uninformed. That is the difference to {@link mergeAttendee}, which
 * serves the schedule poll and deliberately deletes a reset row.
 *
 * Pure and non-mutating.
 *
 * @param attendees `calevent.attendees`; undefined on a legacy document
 * @param person    the invitee
 * @param state     their answer
 */
export function applyInvitationAnswer(attendees: Attendee[] | undefined, person: AvatarInfo, state: InvitationState): Attendee[] {
  const all = attendees ?? [];
  const attendeeState = toAttendeeState(state);
  const current = all.find(attendee => attendee.person.key === person.key);

  if (!current) return [...all, { person, state: attendeeState }];
  if (attendeeState === 'accepted' && current.state !== 'accepted') {
    return [...all.filter(attendee => attendee !== current), { ...current, person, state: attendeeState }];
  }
  return all.map(attendee => attendee === current ? { ...attendee, person, state: attendeeState } : attendee);
}
