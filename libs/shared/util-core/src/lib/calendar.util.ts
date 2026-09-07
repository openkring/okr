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

/**
 * Whether a calendar is public: visible and subscribable for every user of the tenant, rather than
 * only for the members of the group that owns it.
 *
 * The field was called `defaultIsOpen` until 2026-09 and carried two meanings at once — the reach
 * of the calendar AND the default for `calevent.isOpen`. With `isOpen` gone
 * (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 2) only the reach is
 * left, and the field is named for it.
 *
 * ⚠️ The legacy fallback is deliberate and must NOT be simplified to `?? true`: a stored document
 * that still carries `defaultIsOpen: false` would then read as public, i.e. a closed group calendar
 * would become visible to the whole tenant for the window between deploy and data migration.
 * Delete the fallback only after the calendars collection has been migrated.
 *
 * @param calendar a calendar document (or the projection a Cloud Function reads); undefined is never public
 */
export function isCalendarPublic(calendar: { isPublic?: boolean; defaultIsOpen?: boolean } | undefined): boolean {
  if (!calendar) return false;
  return calendar.isPublic ?? calendar.defaultIsOpen ?? true;
}
