// apps/functions/src/calendar/answer-link.ts
//
// Signed «ich nehme teil / nicht teil» links for the invitation email (spec 1.73 §4).
// No token is stored: the signature binds invitation, invitee and answer to a server secret,
// so reading the `invitations` collection does not let anybody forge another person's answer.
// Rotating INVITATION_LINK_SECRET invalidates every link already sent.

import { createHmac, timingSafeEqual } from 'crypto';
import { defineSecret } from 'firebase-functions/params';

export const invitationLinkSecret = defineSecret('INVITATION_LINK_SECRET');

export type AnswerChoice = 'accept' | 'decline';

export function isAnswerChoice(value: unknown): value is AnswerChoice {
  return value === 'accept' || value === 'decline';
}

export function signAnswer(invitationKey: string, inviteeKey: string, answer: AnswerChoice, secret: string): string {
  return createHmac('sha256', secret).update(`${invitationKey}|${inviteeKey}|${answer}`).digest('base64url');
}

export function verifyAnswer(invitationKey: string, inviteeKey: string, answer: AnswerChoice, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(signAnswer(invitationKey, inviteeKey, answer, secret), 'base64url');
  const given = Buffer.from(signature, 'base64url');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The function's own URL — deliberately not an app-domain rewrite, see the spec §4. */
export function answerFunctionUrl(projectId: string): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/invitationAnswer`;
}

export function answerUrl(baseUrl: string, invitationKey: string, inviteeKey: string, answer: AnswerChoice, secret: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('i', invitationKey);
  url.searchParams.set('a', answer);
  url.searchParams.set('s', signAnswer(invitationKey, inviteeKey, answer, secret));
  return url.toString();
}
