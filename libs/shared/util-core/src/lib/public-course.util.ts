import type { ApplicationKind, CalEventModel } from '@okr/shared-models';
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

const AUDIENCE_KINDS: readonly ApplicationKind[] = ['youth', 'adult', 'transfer'];
const DEFAULT_DURATION_MINUTES = 60;

function toIso(storeDate: string | undefined): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.IsoDate, false);
}

/** Visible, sorted public dates of a course's calendar events. */
export function toPublicCourseDates(events: Partial<CalEventModel>[], courseName: string): PublicCourseDate[] {
  const course = courseName.trim().toLowerCase();
  return events
    .filter((e) => e.isArchived !== true && e.state !== 'proposed' && e.state !== 'provisional')
    .slice()
    .sort((a, b) => `${a.startDate ?? ''}${a.startTime ?? ''}`.localeCompare(`${b.startDate ?? ''}${b.startTime ?? ''}`))
    .map((e) => {
      const fullDay = e.fullDay === true;
      const startTime = fullDay ? '' : (e.startTime ?? '');
      const endTime = startTime === '' ? '' : addTime(startTime, 0, e.durationMinutes ?? DEFAULT_DURATION_MINUTES);
      const date = toIso(e.startDate);
      const result: PublicCourseDate = {
        date,
        endDate: fullDay && e.endDate ? toIso(e.endDate) : date,
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
    if (AUDIENCE_KINDS.includes(kind) && !result.includes(kind)) result.push(kind);
  }
  return result;
}

/** Keeps courses offered to at least one of the audiences; `[]` = all. */
export function filterCoursesByAudience<T extends { audience: ApplicationKind[] }>(courses: T[], audience: ApplicationKind[]): T[] {
  if (audience.length === 0) return courses;
  return courses.filter((c) => c.audience.some((a) => audience.includes(a)));
}
