import type { ApplicationCourseState, ApplicationKind } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';

/**
 * Inviting applicants to a course (spec 1.152 §8.1, §8.2, D7). The callables `listCourseApplicants` and
 * `inviteApplicantsToCourse` (apps/functions/src/course/invite-applicants.ts) use the same types.
 */

/** At most this many applications per `inviteApplicantsToCourse` call; the store sends larger selections in slices. */
export const INVITE_MAX_APPLICANTS = 100;

/**
 * One applicant as a course manager may see it (D7): name, type, age, course and state — never an address, AHV
 * number, contact or form answer. `courseKey` / `courseName` / `courseState` describe the course the application is
 * on now ('' = none); `age` is by birth year, `undefined` when unknown.
 */
export type CourseApplicantRow = {
  key: string;
  firstName: string;
  lastName: string;
  applicationAs: ApplicationKind;
  age: number | undefined;
  courseKey: string;
  courseName: string;
  courseState: ApplicationCourseState;
};

/**
 * `listCourseApplicants({ courseKey })`. `placesTaken`, `invited` and `accepted` count every application holding a
 * place on the course (A7), also those no longer open (an approved one keeps its place), so they can exceed the rows.
 */
export type CourseApplicantsResult = {
  rows: CourseApplicantRow[];
  placesTaken: number;
  maxParticipants: number;
  invited: number;
  accepted: number;
};

export type InviteSkipReason = 'no-email' | 'not-found' | 'closed' | 'mail-failed';

/** `inviteApplicantsToCourse({ courseKey, applicationKeys })`. */
export type InviteApplicantsResult = {
  invited: number;
  skipped: { key: string; reason: InviteSkipReason }[];
};

/** `courseApplicantCounts({ courseKeys })`: places taken per course key (only the courses the caller may count). */
export type CourseApplicantCountsResult = { counts: Record<string, number> };

export type CourseApplicantGroups = {
  /** already on this course */
  onCourse: CourseApplicantRow[];
  /** applicant type in the course audience */
  inAudience: CourseApplicantRow[];
  /** everybody else — the callable returns these to privileged users only (D7) */
  others: CourseApplicantRow[];
};

/** The three groups of the invite dialog, in the order the callable sorted the rows (by name). */
export function groupCourseApplicants(rows: CourseApplicantRow[], courseKey: string, audience: ApplicationKind[] | undefined): CourseApplicantGroups {
  const groups: CourseApplicantGroups = { onCourse: [], inAudience: [], others: [] };
  const kinds = audience ?? [];
  for (const row of rows) {
    if (row.courseKey === courseKey) groups.onCourse.push(row);
    else if (kinds.includes(row.applicationAs)) groups.inAudience.push(row);
    else groups.others.push(row);
  }
  return groups;
}

/** Pre-ticked in the dialog: the self-registrations for this course (`registered`), §8.1. */
export function preselectedApplicantKeys(rows: CourseApplicantRow[], courseKey: string): string[] {
  return rows.filter(r => r.courseKey === courseKey && r.courseState === 'registered').map(r => r.key);
}

export type CourseInviteCountsLabels = { places: string; unlimited: string; invited: string; accepted: string };

/** «8 Plätze · 5 eingeladen · 2 zugesagt» (A4: informative only). Labels use `{max}` / `{n}`. */
export function courseInviteCountsLine(
  counts: Pick<CourseApplicantsResult, 'maxParticipants' | 'invited' | 'accepted'>,
  labels: CourseInviteCountsLabels,
): string {
  const max = counts.maxParticipants ?? 0;
  return [
    max > 0 ? fill(labels.places, { max }) : labels.unlimited,
    fill(labels.invited, { n: counts.invited ?? 0 }),
    fill(labels.accepted, { n: counts.accepted ?? 0 }),
  ].join(' · ');
}

export type InviteResultLabels = { invited: string; skipped: string; reasons: Record<InviteSkipReason, string> };

/** The toast after inviting: how many were invited, then every skipped row by name with its reason. */
export function inviteResultMessage(result: InviteApplicantsResult, rows: CourseApplicantRow[], labels: InviteResultLabels): string {
  const invited = fill(labels.invited, { n: result.invited });
  if (result.skipped.length === 0) return invited;
  const names = new Map(rows.map(r => [r.key, `${r.firstName} ${r.lastName}`.trim()]));
  const list = result.skipped.map(s => `${names.get(s.key) || s.key} (${labels.reasons[s.reason] ?? s.reason})`).join(', ');
  return `${invited} ${fill(labels.skipped, { list })}`;
}

/** Slices of at most `size` keys. */
export function chunkKeys(keys: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += size) chunks.push(keys.slice(i, i + size));
  return chunks;
}
