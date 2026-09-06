import { AvatarInfo, CalEventModel } from '@okr/shared-models';

import { getBoatSeats } from './trip.util';

/**
 * From this crew size on, a trip is worth filling from a training: a 1x/2x is entered by the two
 * people standing at the kiosk, a 4x/4+/8+ is almost always a training group that is already
 * listed as the attendees of that day's calevent.
 */
export const TRAINING_CREW_MIN_SEATS = 4;

/** A training of the trip's day whose attendees can be taken over as the crew of the trip. */
export type TrainingCrew = {
  /** okey of the calevent — used as the ActionSheet button's data */
  key: string;
  name: string;
  /** startTime as stored on the calevent ('HH:mm'), for the option label */
  startTime: string;
  /** how many attendees the training offers (declined ones are not counted) */
  attendeeCount: number;
  /** the attendees that fit into the boat, accepted ones first, capped at the boat's seats */
  crew: AvatarInfo[];
};

/** Whether a boat is big enough to offer the "take the crew from a training" shortcut. */
export function isTrainingCrewBoat(subType?: string, seats = 0): boolean {
  return (getBoatSeats(subType) || seats) >= TRAINING_CREW_MIN_SEATS;
}

/**
 * The attendees that may row: everybody who did not decline, the confirmed ones first so a boat
 * that is smaller than the group is filled with those who actually said yes.
 */
function rowableAttendees(calEvent: CalEventModel): AvatarInfo[] {
  const attendees = calEvent.attendees ?? [];
  return [
    ...attendees.filter(a => a.state === 'accepted'),
    ...attendees.filter(a => a.state === 'invited'),
  ].map(a => a.person);
}

/**
 * The trainings of `startDate` whose group fits the boat, each with the crew it would put into it.
 *
 * A training matches the boat when its `maxAttendees` equals the boat's seats — that is what the
 * limit is for: an event capped at 4 is a quad's training. An event with no limit (`maxAttendees`
 * 0, the default and everything written before the field existed) always matches, otherwise a club
 * that does not maintain the cap would never see a proposal.
 */
export function findTrainingCrews(calEvents: CalEventModel[], startDate: string, seats: number): TrainingCrew[] {
  if (seats < TRAINING_CREW_MIN_SEATS || !startDate) return [];
  return (calEvents ?? [])
    .filter(e =>
      e.type === 'training' &&
      e.startDate === startDate &&
      !e.isArchived &&
      e.state !== 'cancelled' &&
      // maxAttendees is optional on read — a legacy event has no cap and matches every boat
      ((e.maxAttendees ?? 0) === 0 || (e.maxAttendees ?? 0) === seats)
    )
    .map(e => {
      const attendees = rowableAttendees(e);
      return {
        key: e.okey,
        name: e.name,
        startTime: e.startTime,
        attendeeCount: attendees.length,
        crew: attendees.slice(0, seats),
      } satisfies TrainingCrew;
    })
    .filter(t => t.attendeeCount > 0)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
