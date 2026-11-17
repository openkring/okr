import { PERSONAL_CALENDAR_KEY, TRIP_CALEVENT_TYPE } from '@okr/shared-constants';
import { AvatarInfo, CalEventModel } from '@okr/shared-models';

import type { TransitConnection } from './transit-connection.model';
import { clockTime } from './transit-connection.util';
import { sbbTimetableUrl, zurichDateParts } from './transit-links.util';
import type { TransitPlace } from './transit-place.model';
import { eventPlaceLabel, isPrivatePlace } from './transit-place.util';

/** One line per leg, e.g. `16:18 R45 Gl. 1 Dieni → 17:02 Chur`; walks and changes as `10' zu Fuss`. Times on the Zurich clock. */
export function tripDescription(c: TransitConnection, labels: { change: string; walk: string; platform: string }): string {
  return c.legs
    .map((leg) => {
      if (leg.kind !== 'ride') return `${leg.durationMinutes}' ${labels.walk}`;
      const platform = leg.platform ? ` ${labels.platform} ${leg.platform}` : '';
      return `${clockTime(leg.departure)} ${leg.line}${platform} ${leg.from} → ${clockTime(leg.arrival)} ${leg.to}`;
    })
    .join('\n');
}

/**
 * The calendar event of a chosen connection (spec 1.162 §5.4). Privacy: a `current` or `home` place
 * appears only as its generic label, and an event with such an end gets no link, because the link
 * carries the coordinates. Start/end are the Europe/Zurich wall clock (`calendar` skill), whatever
 * the device zone.
 */
export function connectionToCalevent(args: {
  connection: TransitConnection;
  from: TransitPlace;
  to: TransitPlace;
  calendarKey: string;
  title: string;
  tenantId: string;
  organiser: AvatarInfo;
  labels: { current: string; home: string; change: string; walk: string; platform: string; sbb: string };
}): CalEventModel {
  const { connection, from, to, calendarKey, title, tenantId, organiser, labels } = args;
  const event = new CalEventModel(tenantId);
  const dep = Date.parse(connection.departure);
  const arr = Date.parse(connection.arrival);
  const p = zurichDateParts(dep);

  event.name = title;
  event.type = TRIP_CALEVENT_TYPE;
  event.startDate = `${p.year}${p.month}${p.day}`;
  event.startTime = `${p.hour}:${p.minute}`;
  event.fullDay = false;
  event.durationMinutes = Math.round((arr - dep) / 60000);
  event.calendars = calendarKey === PERSONAL_CALENDAR_KEY ? [] : [calendarKey];
  event.responsiblePersons = [organiser];
  event.attendees = [];
  // header names the ends by their generic label only, so a private place never appears as an address
  event.description = `${eventPlaceLabel(from, labels)} → ${eventPlaceLabel(to, labels)}\n${tripDescription(connection, labels)}`;

  if (to.kind === 'location' && to.locationKey) {
    event.locations = [{ key: to.locationKey, name1: to.label, name2: '', label: to.label, modelType: 'location', type: '', subType: '' }];
  } else if (to.kind !== 'current') {
    const text = eventPlaceLabel(to, labels);
    event.locations = [{ key: '', name1: text, name2: '', label: text, modelType: 'location', type: '', subType: '' }];
  } else {
    event.locations = [];
  }

  if (!isPrivatePlace(from) && !isPrivatePlace(to) && from.point && to.point) {
    event.url = sbbTimetableUrl({ label: eventPlaceLabel(from, labels), point: from.point }, { label: eventPlaceLabel(to, labels), point: to.point }, connection.departure, 'departAt');
    event.urlLabel = labels.sbb;
  } else {
    event.url = '';
    event.urlLabel = '';
  }
  return event;
}
