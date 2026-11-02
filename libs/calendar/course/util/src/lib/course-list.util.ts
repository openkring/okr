import { AvatarInfo, CourseModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { csvText } from './course-export.util';

/** Column titles and status words of the course list CSV, in the user's language. */
export type CourseListCsvLabels = {
  name: string;
  period: string;
  responsible: string;
  trainers: string;
  status: string;
  locked: string;
  reported: string;
};

function viewDate(storeDate: string): string {
  return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
}

/** «Anna Muster, Beat Beispiel» — first name first, as people read it. */
function names(persons: AvatarInfo[] | undefined): string {
  return (persons ?? []).map(p => `${p.name1} ${p.name2}`.trim()).join(', ');
}

/** Period as shown in the list: one day → «15.10.2026», else «15.10.2026 - 20.12.2026». */
export function formatCoursePeriod(course: Pick<CourseModel, 'startDate' | 'endDate'>): string {
  const start = viewDate(course.startDate);
  const end = viewDate(course.endDate);
  if (!end || end === start) return start;
  return start ? `${start} - ${end}` : end;
}

/**
 * The course list as CSV rows, header first (the `exportGeneric` action of the list). Free text (course name, person
 * names) is neutralised against formula injection; the status column carries «locked» / «reported» words only.
 */
export function buildCourseListRows(courses: CourseModel[], labels: CourseListCsvLabels): string[][] {
  const header = [labels.name, labels.period, labels.responsible, labels.trainers, labels.status];
  const rows = courses.map(c => {
    const status = [c.isLocked ? labels.locked : '', c.reportedAt ? labels.reported : ''].filter(Boolean).join(', ');
    return [csvText(c.name), formatCoursePeriod(c), csvText(names(c.responsiblePersons)), csvText(names(c.trainers)), status];
  });
  return [header, ...rows];
}
