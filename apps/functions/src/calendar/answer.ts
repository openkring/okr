// apps/functions/src/calendar/answer.ts
//
// Answering an invitation from the email, without logging in (spec 1.73 §4).
//
// GET never writes: mail scanners open every link, so the mail's «Antworten» link (GET) only shows
// the answer page with «Ich nehme teil» / «Ich nehme nicht teil». The POST from that page re-checks
// the signature and writes exactly what InvitationService.respond
// writes in the app — invitation state + respondedAt, the event's attendee entry
// (applyInvitationAnswer, in a transaction) and the answer comment on invitation.<okey>.

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { projectID } from 'firebase-functions/params';
import { DocumentReference, getFirestore } from 'firebase-admin/firestore';
import { applyInvitationAnswer, getEventLocationName } from '@okr/shared-util-core';
import { AvatarInfo, Attendee } from '@okr/shared-models';
import { splitAttendees } from '@okr/calendar-calevent-util';

import { allowedAnswers, answerFunctionUrl, invitationLinkSecret, isAnswerChoice } from './answer-link';
import { brandOf, eventUrl, NO_TENANT_LINKS, tenantLinks } from './deliver';
import { AnswerableEvent, eventInTenant, InvitationDoc } from './invitation';
import { answerPage, answerResultPage, Brand, eventWhen } from './mail';
import { AnswerRefusal, eventRefusalOf, REFUSAL_TEXT } from './refusal';
import { todayStoreDate } from './recipients';
import { toStoreDateTime } from '../srv/zurich-time';

const REGION = 'europe-west6';
const CF_NAME = 'invitationAnswer';

// re-exported so existing importers keep working
export type { AnswerRefusal };
export { REFUSAL_TEXT };

/**
 * Whether the invitation may still be answered (undefined = yes). Signature checking is separate, see linkRefusal.
 * keep in sync with libs/shared/util-core/src/lib/calevent-attendance.util.ts:isCaleventAttendanceClosed, the rule
 * of the app; it is spelled out here because each case has its own text.
 */
export function decideAnswer(inv: InvitationDoc | undefined, event: AnswerableEvent | undefined, today: string): AnswerRefusal | undefined {
  if (!inv || inv.isArchived) return 'gone';
  if (inv.isLocked) return 'locked';
  return eventRefusalOf(event, today);
}

/** What the invitee reads after answering. A yes past the cap is recorded, and lands on the waiting list. */
export function answerResultText(state: 'accepted' | 'declined', waiting: boolean): { title: string; message: string } {
  if (state === 'declined') return { title: 'Danke für deine Rückmeldung', message: 'Du hast für den Anlass abgesagt.' };
  return {
    title: 'Danke für deine Zusage',
    message: waiting ? 'Die maximale Teilnehmerzahl ist erreicht, du bist auf der Warteliste.' : 'Du bist für den Anlass angemeldet.',
  };
}

/**
 * Whether the link itself holds up (undefined = yes). A well-formed link to an invitation that no
 * longer exists is 'gone' (404); a bad answer or a bad signature is 'invalid' (403).
 */
export function linkRefusal(hasInvitation: boolean, answerValid: boolean, signatureValid: boolean): { reason: AnswerRefusal; status: number } | undefined {
  if (!hasInvitation) {
    return answerValid ? { reason: 'gone', status: 404 } : { reason: 'invalid', status: 403 };
  }
  if (!answerValid || !signatureValid) return { reason: 'invalid', status: 403 };
  return undefined;
}

/** Mirrors getResponseCommentKey in libs/relationship/invitation/util (not importable here). */
export function responseCommentKey(state: 'accepted' | 'declined'): string {
  return `@relationship/invitation/feature.comment.${state}`;
}

interface FullInvitation extends InvitationDoc { inviteeFirstName?: string; inviteeLastName?: string }

/** GET reads the query (the email link), POST only the form body (the confirm page). */
function param(req: { method: string; query: Record<string, unknown>; body?: Record<string, unknown> }, name: string): string {
  const value = req.method === 'POST' ? req.body?.[name] : req.query[name];
  return typeof value === 'string' ? value : '';
}

/**
 * The write half of InvitationService.respond, in one transaction. Reads first (Firestore requires
 * it), and the lock/archive/past check runs again on the fresh documents: an organiser may have
 * locked the answers since the confirm page was shown. Returns the refusal when nothing was written,
 * otherwise whether the answer put the invitee on the waiting list.
 */
async function recordAnswer(invRef: DocumentReference, eventRef: DocumentReference, invitationKey: string, inv: FullInvitation, state: 'accepted' | 'declined', tenantId: string): Promise<{ refusal: AnswerRefusal } | { waiting: boolean }> {
  const db = getFirestore();
  const now = toStoreDateTime(new Date());
  const person: AvatarInfo = {
    key: inv.inviteeKey ?? '', name1: inv.inviteeFirstName ?? '', name2: inv.inviteeLastName ?? '',
    modelType: 'person', type: '', subType: '', label: '',
  };
  const authorName = `${inv.inviteeFirstName ?? ''} ${inv.inviteeLastName ?? ''}`.trim();

  return db.runTransaction(async (tx) => {
    const [freshInv, freshEvent] = await Promise.all([tx.get(invRef), tx.get(eventRef)]);
    const current = freshInv.exists ? (freshInv.data() as InvitationDoc) : undefined;
    const refusal = decideAnswer(
      current,
      eventInTenant(freshEvent.data(), current?.tenants),
      todayStoreDate(),
    );
    if (refusal) return { refusal };
    const attendees = applyInvitationAnswer(freshEvent.data()?.['attendees'] as Attendee[] | undefined, person, state);
    tx.update(invRef, { state, respondedAt: now });
    tx.update(eventRef, { attendees });
    tx.set(db.collection('comments').doc(), {
      parentKey: `invitation.${invitationKey}`,
      isArchived: false,
      tenants: [tenantId],
      description: responseCommentKey(state),
      authorKey: person.key,
      creationDateTime: now,
      tags: '',
      attachmentKeys: [],
      index: `ak:${person.key}, d:${now}, pk:invitation.${invitationKey}`,
      authorName,
    });
    return { waiting: splitAttendees(attendees, freshEvent.data()?.['maxAttendees'] as number | undefined).waiting.some((attendee) => attendee.person.key === person.key) };
  });
}

export const invitationAnswer = onRequest(
  { region: REGION, secrets: [invitationLinkSecret], cors: false },
  async (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' && req.method !== 'POST') { res.set('Allow', 'GET, POST'); res.status(405).send(''); return; }

    // Everything below can throw (Firestore/tenantLinks failure, transaction contention, the
    // invitation getting deleted mid-flight in recordAnswer). This is a bare onRequest handler —
    // an uncaught throw here would otherwise escape as a raw framework crash page instead of the
    // same branded result page every other outcome gets.
    let brand: Brand = { appName: '' };
    try {
      const params = { method: req.method, query: req.query as Record<string, unknown>, body: req.body as Record<string, unknown> | undefined };
      const invitationKey = param(params, 'i');
      const answer = param(params, 'a');
      const signature = param(params, 's');
      const db = getFirestore();
      const invRef = invitationKey ? db.collection('invitations').doc(invitationKey) : undefined;
      const invSnap = invRef ? await invRef.get() : undefined;
      const inv = invSnap?.exists ? (invSnap.data() as FullInvitation) : undefined;
      const tenantId = inv?.tenants?.[0] ?? '';
      const links = tenantId ? await tenantLinks(tenantId) : NO_TENANT_LINKS;
      brand = brandOf(links);

      const refuse = (reason: AnswerRefusal, status = 200): void => {
        res.status(status).send(answerResultPage({ ...brand, ...REFUSAL_TEXT[reason] }));
      };

      // GET: the «Antworten» link carries no answer (a legacy link carries its one signed answer).
      // POST: the pressed button's answer, which the signature must allow.
      const answers = inv ? allowedAnswers(invitationKey, inv.inviteeKey ?? '', signature, invitationLinkSecret.value(), answer) : [];
      const answerValid = req.method === 'GET' ? answer === '' || isAnswerChoice(answer) : isAnswerChoice(answer);
      const signatureValid = req.method === 'GET' ? answers.length > 0 : isAnswerChoice(answer) && answers.includes(answer);
      const badLink = linkRefusal(!!inv, answerValid, signatureValid);
      if (badLink) { refuse(badLink.reason, badLink.status); return; }
      // unreachable after linkRefusal — only here so TypeScript narrows the types
      if (!inv || !invRef) { refuse('invalid', 403); return; }

      const caleventKey = inv.caleventKey ?? '';
      const eventRef = caleventKey ? db.collection('calevents').doc(caleventKey) : undefined;
      const eventSnap = eventRef ? await eventRef.get() : undefined;
      const event = eventInTenant(eventSnap?.data(), inv.tenants);
      const refusal = decideAnswer(inv, event, todayStoreDate());
      if (refusal || !eventRef) { refuse(refusal ?? 'eventGone'); return; }

      if (req.method === 'GET') {
        res.status(200).send(answerPage({
          ...brand,
          eventName: event?.name ?? '',
          when: eventWhen(event?.startDate, event?.startTime),
          location: getEventLocationName(event),
          answers, state: inv.state, postUrl: answerFunctionUrl(projectID.value()), invitationKey, signature,
        }));
        return;
      }
      if (!isAnswerChoice(answer)) { refuse('invalid', 403); return; }   // narrowing only, see linkRefusal

      const state = answer === 'accept' ? 'accepted' : 'declined';
      const outcome = await recordAnswer(invRef, eventRef, invitationKey, inv, state, tenantId);
      if ('refusal' in outcome) { refuse(outcome.refusal); return; }
      logger.info(`${CF_NAME}: recorded ${state} for one invitation (tenant ${tenantId})`);

      res.status(200).send(answerResultPage({
        ...brand,
        ...answerResultText(state, outcome.waiting),
        eventUrl: links.appUrl ? eventUrl(links, caleventKey) : undefined,
      }));
    } catch (err) {
      // Never log the invitation key, signature, or any name/email — only that it failed.
      logger.error(`${CF_NAME}: failed`, err);
      if (res.headersSent) return;
      res.status(500).send(answerResultPage({
        ...brand,
        title: 'Das hat nicht geklappt',
        message: 'Deine Antwort konnte nicht gespeichert werden. Versuch es bitte nochmals oder antworte in der App.',
      }));
    }
  },
);
