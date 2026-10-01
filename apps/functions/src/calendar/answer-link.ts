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
