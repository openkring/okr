import { CalendarModel, UserModel } from '@okr/shared-models';

import { hasRole } from './auth.util';

/**
 * An org-owned calendar (owner 'org.<okey>', e.g. 'public', 'scs', 'srv', 'reservations') represents
 * the organisation itself, not a group or a person. Its content is published (the 'public' calendar
 * feeds external consumers such as lokal.news), so it is editorial content rather than group planning.
 * @param calendar
 */
export function isOrgCalendar(calendar: CalendarModel | undefined): boolean {
  return calendar?.owner?.startsWith('org.') === true;
}

/**
 * Whether the current user may write to (i.e. assign a calevent to) the given calendar.
 * Org-owned calendars are reserved for contentAdmin; every other calendar keeps the
 * permissions of the surrounding feature (CalEventList.canChange).
 * @param calendar
 * @param currentUser
 */
export function canWriteCalendar(calendar: CalendarModel | undefined, currentUser: UserModel | undefined): boolean {
  if (!isOrgCalendar(calendar)) return true;
  return hasRole('contentAdmin', currentUser);
}
