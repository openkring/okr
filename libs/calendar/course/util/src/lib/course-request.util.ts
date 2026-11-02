import { fill } from '@okr/shared-util-core';

import { COURSE_I18N_KEYS } from './course-i18n';

type CourseI18nName = keyof typeof COURSE_I18N_KEYS;

/**
 * `details.reason` of an HttpsError of `requestCourseCompensation` → the message the user gets (spec 1.132 §7.6).
 * Several technical reasons share one plain message: the user needs to know what to do, not which check failed.
 */
const REASON_MESSAGES: Record<string, CourseI18nName> = {
  'course-not-locked':    'request_error_notLocked',
  'course-archived':      'request_error_archived',
  'invalid-rate':         'request_error_rate',
  'invalid-person-key':   'request_error_eligible',
  'duplicate-eligible':   'request_error_eligible',
  'invalid-account':      'request_error_account',
  'missing-account':      'request_error_missingAccount',
  'cost-center-invalid':  'request_error_costCenter',
  'foreign-booking':      'request_error_foreignBooking',
  'other-books-final':    'request_error_otherBooks',
  'no-finance':           'request_error_noFinance',
  'books-mismatch':       'request_error_books',
  'missing-books':        'request_error_books',
  'no-accounting-config': 'request_error_booksConfig',
  'books-other-tenant':   'request_error_booksConfig',
  'not-course-manager':   'request_error_permission',
  'course-other-tenant':  'request_error_permission',
  'no-tenant':            'request_error_permission',
  'course-not-found':     'request_error_notFound',
  'invalid-course-key':   'request_error_notFound',
};

/** Error codes of the Functions SDK (`functions/<code>`) that are not answered by a `details.reason`. */
const CODE_MESSAGES: Record<string, CourseI18nName> = {
  'permission-denied':  'request_error_permission',
  'unauthenticated':    'request_error_permission',
  'not-found':          'request_error_notFound',
  'unavailable':        'request_error_network',
  'deadline-exceeded':  'request_error_network',
};

/**
 * The i18n key for a failed compensation request: by `details.reason` first, then by the error code (with or without
 * the `functions/` prefix), else the generic message. Never empty, never the server's own text.
 */
export function compensationErrorKey(error: unknown): CourseI18nName {
  const err = error as { details?: { reason?: unknown }; code?: unknown } | null | undefined;
  const reason = typeof err?.details?.reason === 'string' ? err.details.reason : '';
  if (reason && REASON_MESSAGES[reason]) return REASON_MESSAGES[reason];
  const code = typeof err?.code === 'string' ? err.code.replace(/^functions\//, '') : '';
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  return 'request_error_generic';
}

/** The answer of `requestCourseCompensation` (spec 1.132 §7.6), as the client reads it. */
export type CourseCompensationResult = {
  /** false = the books are kept outside Kring: no bookings, the treasurer's task carries the settlement */
  nativeBooks: boolean;
  written: number;
  /** posted bookings whose amount differs from the new computation; never rewritten */
  kept: { personKey: string; posted: number; computed: number }[];
  /** bookings the treasurer rejected: final, never rewritten */
  cancelled: { personKey: string; amount: number; computed: number }[];
  taskKey: string;
  /** persons who led a counted training but are not on the eligible list */
  unlistedKeys: string[];
};

/**
 * Minimal HTML escape for values interpolated into an alert message: `AlertOptions.message` is rendered as HTML
 * (`innerHTMLTemplatesEnabled`), and names come from Firestore documents, not from code.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One escaped bullet line per item, joined with `<br>`; '' for no items. */
export function htmlLines(items: string[]): string {
  return items.map(item => '• ' + escapeHtml(item)).join('<br>');
}

/** Translated sentences of the compensation summary; `written` contains `{count}`. */
export type CompensationSummaryLabels = { written: string; external: string; kept: string; cancelled: string; unlisted: string };

/**
 * The message after a successful compensation request (§7.6), as alert HTML: what was prepared (or that the books
 * are kept outside the app), then the posted bookings whose amount differs (Kring never corrects them itself), the
 * bookings the treasurer rejected, and the leaders who are not on the eligible list. Names are escaped.
 * @param nameOf person key → display name
 * @param money minor units → display amount
 */
export function compensationSummary(
  result: CourseCompensationResult,
  nameOf: (personKey: string) => string,
  money: (minor: number) => string,
  labels: CompensationSummaryLabels,
): string {
  const parts: string[] = [];
  parts.push(escapeHtml(result.nativeBooks ? fill(labels.written, { count: result.written ?? 0 }) : labels.external));
  const kept = result.kept ?? [];
  if (kept.length > 0) {
    parts.push(escapeHtml(labels.kept) + '<br>' + htmlLines(kept.map(k => `${nameOf(k.personKey)}: ${money(k.posted)} → ${money(k.computed)}`)));
  }
  const cancelled = result.cancelled ?? [];
  if (cancelled.length > 0) {
    parts.push(escapeHtml(labels.cancelled) + '<br>' + htmlLines(cancelled.map(c => `${nameOf(c.personKey)}: ${money(c.amount)} → ${money(c.computed)}`)));
  }
  const unlisted = result.unlistedKeys ?? [];
  if (unlisted.length > 0) {
    parts.push(escapeHtml(labels.unlisted) + '<br>' + htmlLines(unlisted.map(nameOf)));
  }
  return parts.join('<br><br>');
}
