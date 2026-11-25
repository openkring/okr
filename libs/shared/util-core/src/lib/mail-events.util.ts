// Pure helpers of a Versand mail page (spec 1.172, 1.176): the lines of the events block, and how many.
import { EVENTS_CONFIG_SHAPE, type CalEventModel } from '@okr/shared-models';

import { convertDateFormatToString, DateFormat } from './date.util';
import { formatExportTime } from './export.util';

/** One calendar event as an events block lists it; the strings are already formatted for the reader. */
export interface MailEventLine { date: string; time: string; title: string; place: string }

/** The most events one events section or block lists in a mail, whatever its `maxEvents` says. */
export const MAX_MAIL_EVENTS = 10;

/**
 * How many events an events section (its `properties`) or block lists in a mail: its `maxEvents` when that is a number of 1 or
 * more (rounded down), else the model default (`EVENTS_CONFIG_SHAPE.maxEvents`); never more than MAX_MAIL_EVENTS.
 * On the website an unset or 0 `maxEvents` means «all»; a mail has no «all», so it falls back to the default.
 */
export function mailEventLimit(properties: unknown): number {
  const raw: unknown = typeof properties === 'object' && properties !== null ? (properties as { maxEvents?: unknown }).maxEvents : undefined;
  const wanted = typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : EVENTS_CONFIG_SHAPE.maxEvents;
  return Math.min(wanted, MAX_MAIL_EVENTS);
}

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
