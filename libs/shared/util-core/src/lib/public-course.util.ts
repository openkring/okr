import { APPLICATION_KIND_VALUES, type ApplicationKind, type CalEventModel } from '@okr/shared-models';
import type { PublicCourseOption } from './course-choice.util';
import { addTime, convertDateFormatToString, DateFormat } from './date.util';

/**
 * Public projection of a course and its dates (spec 1.166 §5). Pure: whitelists the fields that
 * may leave the system; description, locations and attendees never appear here.
 */

/** One public date of a course. Dates are ISO (`yyyy-MM-dd`), times `HH:mm` or '' (full day / unknown). */
export type PublicCourseDate = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  title?: string;
  isCancelled: boolean;
};

export type PublicCourse = Omit<PublicCourseOption, 'startDate' | 'endDate'> & {
  startDate: string;
  endDate: string;
  dates: PublicCourseDate[];
};

const DEFAULT_DURATION_MINUTES = 60;

function toIso(storeDate: string | undefined): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.IsoDate, false);
}

/** Date plus effective start time: a full-day event has no time, whatever `startTime` holds. */
function sortKey(e: Partial<CalEventModel>): string {
  return `${e.startDate ?? ''}${e.fullDay === true ? '' : (e.startTime ?? '')}`;
}

/** Visible, sorted public dates of a course's calendar events. */
export function toPublicCourseDates(events: Partial<CalEventModel>[], courseName: string): PublicCourseDate[] {
  const course = courseName.trim().toLowerCase();
  return events
    .filter((e) => e.isArchived !== true && e.state !== 'proposed' && e.state !== 'provisional')
    .slice()
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((e) => {
      const fullDay = e.fullDay === true;
      const startTime = fullDay ? '' : (e.startTime ?? '');
      const endTime = startTime === '' ? '' : addTime(startTime, 0, e.durationMinutes ?? DEFAULT_DURATION_MINUTES);
      const date = toIso(e.startDate);
      const result: PublicCourseDate = {
        date,
        endDate: fullDay && e.endDate && e.endDate > (e.startDate ?? '') ? toIso(e.endDate) : date,
        startTime,
        endTime,
        isCancelled: e.state === 'cancelled',
      };
      const name = (e.name ?? '').trim();
      if (name !== '' && name.toLowerCase() !== course) result.title = name;
      return result;
    });
}

export function toPublicCourse(option: PublicCourseOption, events: Partial<CalEventModel>[]): PublicCourse {
  return {
    ...option,
    startDate: toIso(option.startDate),
    endDate: toIso(option.endDate),
    dates: toPublicCourseDates(events, option.name),
  };
}

/** Comma-separated audience query value; unknown values and duplicates are dropped. */
export function parseAudienceParam(raw: unknown): ApplicationKind[] {
  if (typeof raw !== 'string') return [];
  const result: ApplicationKind[] = [];
  for (const part of raw.split(',')) {
    const kind = part.trim() as ApplicationKind;
    if (APPLICATION_KIND_VALUES.includes(kind) && !result.includes(kind)) result.push(kind);
  }
  return result;
}

/** Keeps courses offered to at least one of the audiences; `[]` = all. */
export function filterCoursesByAudience<T extends { audience: ApplicationKind[] }>(courses: T[], audience: ApplicationKind[]): T[] {
  if (audience.length === 0) return courses;
  return courses.filter((c) => c.audience.some((a) => audience.includes(a)));
}

/**
 * What a form does with a course another section asked it to tick (spec 1.166 §8): tick it when it
 * is offered and has a place, drop the request when it is empty or full, wait when it is not
 * offered (yet) — the applicant type that decides the list may still be unknown.
 */
export function resolveCoursePreselect(requested: string, offered: PublicCourseOption[]): 'tick' | 'wait' | 'drop' {
  if (requested === '') return 'drop';
  const course = offered.find((c) => c.key === requested);
  if (!course) return 'wait';
  return course.isFull ? 'drop' : 'tick';
}
