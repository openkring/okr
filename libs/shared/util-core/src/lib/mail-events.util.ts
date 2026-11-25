// Pure helpers of a Versand mail page (spec 1.172, 1.176): the events block and the colour a mail may use.
import type { CalEventModel } from '@okr/shared-models';

import { convertDateFormatToString, DateFormat } from './date.util';
import { formatExportTime } from './export.util';

/** One calendar event as an events block lists it; the strings are already formatted for the reader. */
export interface MailEventLine { date: string; time: string; title: string; place: string }

/**
 * The next `max` events from `today` (StoreDate) on, soonest first. Archived events and past days are dropped.
 * Dates read `dd.MM.yyyy`, times `HH:mm`; the place is the first location's label, else its name.
 */
export function upcomingEventLines(events: CalEventModel[], today: string, max: number): MailEventLine[] {
  return events
    .filter((e) => !e.isArchived && e.startDate >= today)
    .sort((a, b) => `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`))
    .slice(0, Math.max(0, max))
    .map((e) => {
      const loc = e.locations?.[0];
      return {
        date: convertDateFormatToString(e.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false),
        time: formatExportTime(e.startTime),
        title: e.name,
        place: loc ? (loc.label || loc.name1 || loc.name2 || '') : '',
      };
    });
}

/** A safe '#rrggbb' (lowercased) for a style attribute of a Versand mail; anything else is the dark grey `#222222`. */
export function mailColorOf(brandColor: unknown): string {
  return typeof brandColor === 'string' && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor.toLowerCase() : '#222222';
}
