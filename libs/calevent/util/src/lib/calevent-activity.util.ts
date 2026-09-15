import { CalEventModel, CalEventModelName, SeenModel } from '@okr/shared-models';

/** The seen-marker id of an event — the same `<modelType>.<okey>` shape comments use as parentKey. */
export function seenKeyFor(caleventKey: string): string {
  return `${CalEventModelName}.${caleventKey}`;
}

/** `seen` markers as a map parentKey → count, the shape `unseenActivity` reads. */
export function toSeenCounts(markers: SeenModel[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const marker of markers) counts[marker.okey] = marker.count ?? 0;
  return counts;
}

/**
 * How many comments/documents arrived on the event since the user last opened it.
 *
 * 0 when nothing is new, when the event was never opened but has no activity, and — the
 * legacy case — when the event predates the counter (`activityCount` undefined → 0). A marker
 * written before the counter grew can never make the result negative.
 */
export function unseenActivity(calevent: Pick<CalEventModel, 'okey' | 'activityCount'>, seenCounts: Record<string, number>): number {
  const total = calevent.activityCount ?? 0;
  const seen = seenCounts[seenKeyFor(calevent.okey)] ?? 0;
  return Math.max(0, total - seen);
}

/**
 * The activity fields of a COPY of an event. Spread this into every clone (series expansion,
 * 'calevent.copy', decoupling): the counter belongs to the original's comments, and a new
 * occurrence with an inherited count would show a badge for comments it does not have.
 */
export function resetActivity(): Pick<CalEventModel, 'activityCount' | 'lastActivityAt'> {
  return { activityCount: 0, lastActivityAt: '' };
}
