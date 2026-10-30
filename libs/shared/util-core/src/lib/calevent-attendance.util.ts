import { CalEventModel } from '@okr/shared-models';

import { isPastDate } from './date.util';

/**
 * Whether An-/Abmeldung is closed on this event, regardless of who asks: it is over (its last day,
 * `endDate || startDate`, lies before today), locked by the organiser, or called off
 * (state 'cancelled').
 *
 * Lives here (not in `@okr/calevent-util`) so that the invitation rule in `invitation.util.ts` —
 * used by the app badge and the dashboard invitations card — can share it.
 * `isAttendanceClosed` in `@okr/calevent-util` delegates to it; the push gate in
 * `apps/functions/src/calendar/invitation.ts` (`shouldNotifyInvitation`) mirrors it.
 *
 * Firestore reads skip model defaults: `isLocked`/`state` may be undefined on legacy docs, which
 * reads as "not locked" / "not cancelled".
 */
export function isCaleventAttendanceClosed(event: Pick<CalEventModel, 'startDate' | 'endDate' | 'isLocked' | 'state'>): boolean {
  return isPastDate(event.endDate || event.startDate) || !!event.isLocked || event.state === 'cancelled';
}
