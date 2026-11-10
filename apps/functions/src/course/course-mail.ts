// apps/functions/src/course/course-mail.ts
//
// The pages behind the personal course invitation link (spec 1.152 §8.3) and the notice the
// responsible persons get when an applicant answers. Pure string builders on the calendar mail
// helpers (same banner, buttons and escaping as the invitation answer page).
//
// The answer page is opened by whoever holds the link — possibly a forwarded mail. It shows only
// the first name, the course and its dates, nothing else from the application (no last name,
// e-mail, phone, date of birth).

import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { Brand, button, escapeHtml, layout, primaryStyle, SECONDARY } from '../calendar/mail';

/** Why a course answer link is refused. 'invalid' = bad signature (403, no data at all). */
export type CourseAnswerRefusal = 'invalid' | 'not-found' | 'moved' | 'ended';

export const COURSE_REFUSAL_TEXT: Record<CourseAnswerRefusal, { title: string; message: string }> = {
  invalid:     { title: 'Link ungültig', message: 'Dieser Link ist nicht gültig. Wende dich bitte an den Verein.' },
  'not-found': { title: 'Einladung nicht mehr gültig', message: 'Diese Einladung gibt es nicht mehr.' },
  moved:       { title: 'Einladung nicht mehr gültig', message: 'Diese Einladung gilt nicht mehr, weil deine Anmeldung inzwischen einem anderen Kurs zugeordnet ist.' },
  ended:       { title: 'Kurs vorbei', message: 'Dieser Kurs ist bereits zu Ende.' },
};

function viewDate(storeDate: string | undefined): string {
  return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
}

/** «01.11.2026 – 30.11.2026», one date when start and end are the same day, '' without dates. */
export function courseDates(startDate: string | undefined, endDate: string | undefined): string {
  const start = viewDate(startDate);
  const end = viewDate(endDate);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end;
}

function courseBlock(courseName: string, dates: string): string {
  const rows = [`<strong>${escapeHtml(courseName)}</strong>`, dates ? escapeHtml(dates) : ''].filter(Boolean).join('<br>');
  return `<p style="margin:16px 0;padding:12px 16px;background:#f6f8fa;border-radius:6px;">${rows}</p>`;
}

const CURRENT_ANSWER: Record<string, string> = {
  accepted: 'Du hast bereits zugesagt. Du kannst deine Antwort hier ändern.',
  declined: 'Du hast bereits abgesagt. Du kannst deine Antwort hier ändern.',
};

export interface CourseAnswerPageParams extends Brand {
  firstName: string;
  courseName: string;
  startDate: string;
  endDate: string;
  /** The application's courseState; 'accepted' / 'declined' show the current answer. */
  state?: string;
  postUrl: string;
  courseKey: string;
  applicationKey: string;
  signature: string;
}

/**
 * The page behind the link (GET). One form, one submit button per answer; the pressed button's
 * `answer` carries the choice, `c`/`a`/`s` repeat the link so the POST re-verifies it.
 */
export function courseAnswerPage(p: CourseAnswerPageParams): string {
  const current = p.state ? CURRENT_ANSWER[p.state] : undefined;
  const submit = (answer: 'accept' | 'decline', label: string, style: string): string =>
    `<button type="submit" name="answer" value="${answer}" style="${style}border:0;cursor:pointer;font-size:16px;font-family:inherit;">${label}</button>`;
  return layout(p,
    `<h1 style="font-size:20px;margin:0 0 8px;">Hallo ${escapeHtml(p.firstName)}</h1>`
    + `<p>Du bist zu diesem Kurs eingeladen. Nimmst du teil?</p>`
    + courseBlock(p.courseName, courseDates(p.startDate, p.endDate))
    + (current ? `<p style="color:#57606a;">${current}</p>` : '')
    + `<form method="post" action="${escapeHtml(p.postUrl)}">`
    + `<input type="hidden" name="c" value="${escapeHtml(p.courseKey)}">`
    + `<input type="hidden" name="a" value="${escapeHtml(p.applicationKey)}">`
    + `<input type="hidden" name="s" value="${escapeHtml(p.signature)}">`
    + submit('accept', 'Ich nehme teil', primaryStyle(p))
    + submit('decline', 'Ich nehme nicht teil', SECONDARY)
    + `</form>`);
}

/** The confirmation or refusal page. */
export function courseAnswerResultPage(p: Brand & { title: string; message: string }): string {
  return layout(p,
    `<h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(p.title)}</h1>`
    + `<p>${escapeHtml(p.message)}</p>`);
}

/** What the applicant reads after answering. */
export function courseAnswerResultText(state: 'accepted' | 'declined'): { title: string; message: string } {
  return state === 'accepted'
    ? { title: 'Danke für deine Zusage', message: 'Du hast für den Kurs zugesagt.' }
    : { title: 'Danke für deine Rückmeldung', message: 'Du hast für den Kurs abgesagt.' };
}

/** The push body for the responsible persons. */
export function courseAnswerPushBody(fullName: string, answer: 'accepted' | 'declined'): string {
  return `${fullName} hat ${answer === 'accepted' ? 'zugesagt' : 'abgesagt'}`;
}

/** The mail to the responsible persons (A9). The full name is fine here: they manage the course. */
export function courseAnswerNotice(p: Partial<Brand> & {
  firstName: string; lastName: string; courseName: string; answer: 'accepted' | 'declined'; courseUrl?: string;
}): { subject: string; html: string } {
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const verb = p.answer === 'accepted' ? 'zugesagt' : 'abgesagt';
  const brand: Brand = { appName: p.appName ?? '', brandColor: p.brandColor, logoUrl: p.logoUrl, frame: p.frame };
  const html = layout(brand,
    `<p>${escapeHtml(fullName)} hat für <strong>${escapeHtml(p.courseName)}</strong> ${verb}.</p>`
    + (p.courseUrl ? `<p>${button(p.courseUrl, 'Kurs öffnen', primaryStyle(brand))}</p>` : ''));
  return { subject: `${fullName} hat für ${p.courseName} ${verb}`, html };
}
