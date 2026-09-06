import { MAX_DATES_PER_SERIES } from '@okr/shared-constants';
import { CalEventModel } from '@okr/shared-models';
import { calculateRecurringDates, compareDate, deaccent } from '@okr/shared-util-core';

/**
 * Detection helpers for the failure mode that produced three parallel '4X-Dienstag' series on
 * 2026-06-10: a user whose series edit appears to do nothing archives it and creates a new one.
 * The debris is invisible (archived events are filtered out of every list), so nothing surfaces
 * it until members report that they cannot see each other's attendance.
 *
 * All functions here are pure and operate on a plain event list — the AOC action feeds them the
 * tenant's live events, the create path feeds them the same list it already holds.
 */

/*-------------------------- slot key --------------------------------*/

/**
 * The comparison key for "is this the same appointment?". Names are normalised (de-accented,
 * lower-cased, stripped to alphanumerics) on purpose: the real incident used '4X Dienstag' and
 * '4X-Dienstag' for the same thing, and an exact match would have reported nothing.
 */
export function getCalEventSlotKey(calevent: CalEventModel): string {
  const name = deaccent(calevent.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${name}|${calevent.startDate}|${calevent.startTime ?? ''}`;
}

/**
 * A schedule poll writes one document per proposed date, all sharing a name, and its text columns
 * carry a `columnLabel` instead of a real date. Those are duplicates by construction and never
 * appear in a calendar — excluding them keeps the report free of false positives.
 */
function isReportableEvent(calevent: CalEventModel): boolean {
  if (calevent.isArchived) return false;
  if ((calevent.columnLabel ?? '').length > 0) return false;
  if (calevent.state === 'proposed') return false;
  return (calevent.startDate ?? '').length === 8;
}

/*-------------------------- duplicates --------------------------------*/

/** Two or more live events that occupy the same slot (normalised name + date + time). */
export type CalEventDuplicate = {
  /** the name of the first event in the group, for display */
  name: string;
  startDate: string;
  startTime: string;
  /** the colliding events, ordered by okey */
  events: CalEventModel[];
  /** distinct seriesIds involved; '' stands for a single (non-series) event */
  seriesIds: string[];
  /** distinct calendar keys across the group — differing calendars are the split-attendance case */
  calendars: string[];
};

/**
 * Finds live events that occupy the same slot. This is the check that would have flagged the
 * '4X-Dienstag' incident on the day it happened.
 * @param events all events to consider; archived ones and poll columns are skipped
 * @returns one entry per colliding slot, ordered by date
 */
export function findDuplicateCalEvents(events: CalEventModel[]): CalEventDuplicate[] {
  const bySlot = new Map<string, CalEventModel[]>();
  for (const event of events) {
    if (!isReportableEvent(event)) continue;
    const key = getCalEventSlotKey(event);
    const bucket = bySlot.get(key);
    if (bucket) bucket.push(event); else bySlot.set(key, [event]);
  }

  const duplicates: CalEventDuplicate[] = [];
  for (const bucket of bySlot.values()) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((a, b) => a.okey.localeCompare(b.okey));
    duplicates.push({
      name: ordered[0].name,
      startDate: ordered[0].startDate,
      startTime: ordered[0].startTime ?? '',
      events: ordered,
      seriesIds: [...new Set(ordered.map(e => e.seriesId ?? ''))],
      calendars: [...new Set(ordered.flatMap(e => e.calendars ?? []))],
    });
  }
  return duplicates.sort((a, b) => compareDate(a.startDate, b.startDate));
}

/**
 * The create-time guard: does a new event land on a slot that is already taken?
 * @param candidate the event about to be created (a series is checked by its first occurrence)
 * @param existing the live events of the target calendar
 * @returns the events already sitting on that slot, empty when the slot is free
 */
export function findConflictingCalEvents(candidate: CalEventModel, existing: CalEventModel[]): CalEventModel[] {
  if (!isReportableEvent({ ...candidate, isArchived: false })) return [];
  const key = getCalEventSlotKey(candidate);
  return existing.filter(e => e.okey !== candidate.okey && isReportableEvent(e) && getCalEventSlotKey(e) === key);
}

/*-------------------------- series health --------------------------------*/

export type SeriesIssueKind =
  /** fewer (or more) occurrences than the stored recurrence rule describes */
  | 'countMismatch'
  /** an occurrence whose `index` carries a different date than its own `startDate` */
  | 'staleIndex';

export type SeriesIssue = {
  seriesId: string;
  name: string;
  kind: SeriesIssueKind;
  /** occurrences the rule describes (0 when the rule is unusable, e.g. over the ceiling) */
  expected: number;
  /** occurrences actually stored */
  actual: number;
  firstDate: string;
  lastDate: string;
  /** okeys of the offending occurrences — only set for 'staleIndex' */
  okeys: string[];
};

/**
 * Audits every live series for the two fingerprints the 2026-06 incident left behind:
 *
 * - **countMismatch** — the stored `repeatUntilDate`/`periodicity` no longer match the number of
 *   documents. `kgmr0oy175egywbn43` held 13 occurrences while its rule described 101, because the
 *   rule was rewritten before `planSeriesReconcile` existed (fix `393a2343f`, 2026-08-13).
 * - **staleIndex** — an occurrence whose `index` names the series' first date rather than its own.
 *   That is what a whole-model spread into a sibling update leaves behind, and it means `attendees`
 *   may have been copied across the series too. It is the earliest signal for
 *   "members see attendance that is not theirs".
 *
 * A poll-born series (`pollMultiSelect`) has irregular dates that no periodicity describes and is
 * deliberately excluded from the count check — see CalEventModel.pollMultiSelect.
 */
export function auditCalEventSeries(events: CalEventModel[]): SeriesIssue[] {
  const bySeries = new Map<string, CalEventModel[]>();
  for (const event of events) {
    if (!isReportableEvent(event)) continue;
    const seriesId = event.seriesId ?? '';
    if (seriesId.length === 0) continue;
    const bucket = bySeries.get(seriesId);
    if (bucket) bucket.push(event); else bySeries.set(seriesId, [event]);
  }

  const issues: SeriesIssue[] = [];
  for (const [seriesId, bucket] of bySeries) {
    const ordered = [...bucket].sort((a, b) => compareDate(a.startDate, b.startDate));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];

    const stale = ordered.filter(e => (e.index ?? '').length > 0 && !e.index.includes(`d:${e.startDate}`));
    if (stale.length > 0) {
      issues.push({
        seriesId, name: first.name, kind: 'staleIndex',
        expected: ordered.length, actual: ordered.length - stale.length,
        firstDate: first.startDate, lastDate: last.startDate,
        okeys: stale.map(e => e.okey),
      });
    }

    if (!first.pollMultiSelect && first.periodicity !== 'once' && (first.repeatUntilDate ?? '').length === 8) {
      // calculateRecurringDates stops one past the ceiling, so an oversized rule reports
      // MAX+1 — keep that value, it is exactly what makes the rule unusable.
      const expected = calculateRecurringDates(first.startDate, first.repeatUntilDate, first.periodicity).length;
      if (expected !== ordered.length) {
        issues.push({
          seriesId, name: first.name, kind: 'countMismatch',
          expected, actual: ordered.length,
          firstDate: first.startDate, lastDate: last.startDate,
          okeys: [],
        });
      }
    }
  }
  return issues.sort((a, b) => compareDate(a.firstDate, b.firstDate));
}

/*-------------------------- series preview --------------------------------*/

/** What the form shows before a series is saved, so a wrong start date is visible up front. */
export type SeriesPreview = {
  dates: string[];
  count: number;
  firstDate: string;
  lastDate: string;
  /** the range produces no date at all (repeatUntilDate before startDate) */
  isEmpty: boolean;
  /** the range exceeds MAX_DATES_PER_SERIES and would be refused on save */
  exceedsMax: boolean;
};

/**
 * Expands a recurrence rule without writing anything, for the form's preview line
 * ('29 Termine, Di 16.06.2026 – Di 29.12.2026'). Same expansion the store uses on save, so the
 * preview and the result can never disagree.
 */
export function previewSeries(startDate: string, repeatUntilDate: string, periodicity: string): SeriesPreview {
  const dates = calculateRecurringDates(startDate, repeatUntilDate, periodicity);
  return {
    dates,
    count: dates.length,
    firstDate: dates[0] ?? '',
    lastDate: dates[dates.length - 1] ?? '',
    isEmpty: dates.length === 0,
    exceedsMax: dates.length > MAX_DATES_PER_SERIES,
  };
}

/*-------------------------- weekday --------------------------------*/

/**
 * ISO weekday of a StoreDate: 1 = Monday … 7 = Sunday, 0 when the date is unusable.
 *
 * Built with the LOCAL Date constructor and read back with a LOCAL getter, per the wall-clock
 * contract — a StoreDate is a local calendar day and has no instant to convert.
 *
 * This exists so a form can show 'Di 16.06.2026'. The 2026-06-10 incident started with a series
 * called '4X-Dienstag' whose first occurrence fell on a Saturday, and nothing on screen said so.
 */
export function getWeekdayIndex(storeDate: string | undefined): number {
  if (!storeDate || storeDate.length !== 8) return 0;
  const year = Number(storeDate.slice(0, 4));
  const month = Number(storeDate.slice(4, 6));
  const day = Number(storeDate.slice(6, 8));
  if (!year || !month || !day) return 0;
  const date = new Date(year, month - 1, day);
  // reject a rolled-over date (e.g. 20260231 -> 3 March), which would report a wrong weekday
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 0;
  const day0 = date.getDay(); // 0 = Sunday
  return day0 === 0 ? 7 : day0;
}
