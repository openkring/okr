/** The calendar whose events the website shows (publicApi /calendar, spec 1.165 D3). */
export const PUBLIC_CALENDAR = 'public';

/** Whether an event is shown on the website. */
export function isPublicCalendar(calendars: string[] | undefined): boolean {
  return (calendars ?? []).includes(PUBLIC_CALENDAR);
}

/** The event's calendars with `public` added (once, at the end) or removed; the other calendars keep their order. */
export function setPublicCalendar(calendars: string[] | undefined, on: boolean): string[] {
  const rest = (calendars ?? []).filter((c) => c !== PUBLIC_CALENDAR);
  return on ? [...rest, PUBLIC_CALENDAR] : rest;
}
