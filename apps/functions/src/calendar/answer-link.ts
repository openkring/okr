// apps/functions/src/calendar/answer-link.ts
//
// Signed answer links for the invitation email (spec 1.73 §4).
// No token is stored: the signature binds invitation and invitee (and, for the legacy links, the
// answer) to a server secret, so reading the `invitations` collection does not let anybody forge
// another person's answer. Rotating INVITATION_LINK_SECRET invalidates every link already sent.
//
// Two link generations:
// - «Antworten» (current): one link, signed for `respond`, opens a page offering BOTH answers.
// - «ich nehme teil / nicht teil» (before 2026-10-01): one link per answer, signed for that answer
//   alone. Still honoured, so mails already in inboxes keep working; such a page offers only it.
// - Versand mailing (spec 1.145): one personal link per recipient of a mailing, signed for `mailing`
//   and keyed by the mailing and the person. It is a third kind, never valid on the invitation function.
// - Kurs-Einladung (spec 1.152 §8.3): one personal link per invited applicant, signed for `course` and
//   keyed by the course and the application. A fourth kind, valid only on courseAnswer — and no other
//   kind is valid there.

import { createHmac, timingSafeEqual } from 'crypto';
import { defineSecret } from 'firebase-functions/params';

export const invitationLinkSecret = defineSecret('INVITATION_LINK_SECRET');

export type AnswerChoice = 'accept' | 'decline';

export function isAnswerChoice(value: unknown): value is AnswerChoice {
  return value === 'accept' || value === 'decline';
}

/** Legacy per-answer signature (see the header). Only tests and old links still need it. */
export function signAnswer(invitationKey: string, inviteeKey: string, answer: AnswerChoice, secret: string): string {
  return sign(invitationKey, inviteeKey, answer, secret);
}

export function verifyAnswer(invitationKey: string, inviteeKey: string, answer: AnswerChoice, signature: string, secret: string): boolean {
  return verify(invitationKey, inviteeKey, answer, signature, secret);
}

/** What the respond signature binds instead of an answer — never a valid AnswerChoice. */
const RESPOND = 'respond';

function sign(invitationKey: string, inviteeKey: string, scope: string, secret: string): string {
  return createHmac('sha256', secret).update(`${invitationKey}|${inviteeKey}|${scope}`).digest('base64url');
}

function verify(invitationKey: string, inviteeKey: string, scope: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(sign(invitationKey, inviteeKey, scope, secret), 'base64url');
  const given = Buffer.from(signature, 'base64url');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function signRespond(invitationKey: string, inviteeKey: string, secret: string): string {
  return sign(invitationKey, inviteeKey, RESPOND, secret);
}

/**
 * The answers a signature allows: both for a respond signature, the one signed answer for a legacy
 * link (`legacyAnswer` = its `a` parameter), none for anything else.
 */
export function allowedAnswers(invitationKey: string, inviteeKey: string, signature: string, secret: string, legacyAnswer?: string): AnswerChoice[] {
  if (verify(invitationKey, inviteeKey, RESPOND, signature, secret)) return ['accept', 'decline'];
  if (isAnswerChoice(legacyAnswer) && verifyAnswer(invitationKey, inviteeKey, legacyAnswer, signature, secret)) return [legacyAnswer];
  return [];
}

/** The function's own URL — deliberately not an app-domain rewrite, see the spec §4. */
export function answerFunctionUrl(projectId: string): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/invitationAnswer`;
}

/** The «Antworten» link: opens the answer page offering both answers. */
export function respondUrl(baseUrl: string, invitationKey: string, inviteeKey: string, secret: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('i', invitationKey);
  url.searchParams.set('s', signRespond(invitationKey, inviteeKey, secret));
  return url.toString();
}

/** What the mailing signature binds — never a valid AnswerChoice nor the respond scope. */
const MAILING = 'mailing';

export function signMailing(mailingKey: string, personKey: string, secret: string): string {
  return sign(mailingKey, personKey, MAILING, secret);
}

export function verifyMailing(mailingKey: string, personKey: string, signature: string, secret: string): boolean {
  return verify(mailingKey, personKey, MAILING, signature, secret);
}

/** The function's own URL for the Versand answer page. */
export function mailingAnswerFunctionUrl(projectId: string): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/mailingAnswer`;
}

/** The personal Versand answer link: `m` = mailing, `p` = person, `s` = signature. */
export function mailingAnswerUrl(baseUrl: string, mailingKey: string, personKey: string, secret: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('m', mailingKey);
  url.searchParams.set('p', personKey);
  url.searchParams.set('s', signMailing(mailingKey, personKey, secret));
  return url.toString();
}

/** What the course signature binds — never a valid AnswerChoice nor the respond or mailing scope. */
const COURSE = 'course';

export function signCourse(courseKey: string, applicationKey: string, secret: string): string {
  return sign(courseKey, applicationKey, COURSE, secret);
}

export function verifyCourse(courseKey: string, applicationKey: string, signature: string, secret: string): boolean {
  return verify(courseKey, applicationKey, COURSE, signature, secret);
}

/** The function's own URL for the course answer page. */
export function courseAnswerFunctionUrl(projectId: string): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/courseAnswer`;
}

/** The personal course invitation link: `c` = course, `a` = application, `s` = signature. */
export function courseAnswerUrl(projectId: string, courseKey: string, applicationKey: string, secret: string): string {
  const url = new URL(courseAnswerFunctionUrl(projectId));
  url.searchParams.set('c', courseKey);
  url.searchParams.set('a', applicationKey);
  url.searchParams.set('s', signCourse(courseKey, applicationKey, secret));
  return url.toString();
}
