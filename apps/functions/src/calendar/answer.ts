// apps/functions/src/calendar/answer.ts
//
// «ich nehme teil / nicht teil» from the invitation email, without logging in (spec 1.73 §4).
//
// GET never writes: mail scanners open every link, so GET only shows a confirm page. The POST
// from that page re-checks the signature and writes exactly what InvitationService.respond
// writes in the app — invitation state + respondedAt, the event's attendee entry
// (applyInvitationAnswer, in a transaction) and the answer comment on invitation.<okey>.

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { projectID } from 'firebase-functions/params';
import { DocumentReference, getFirestore } from 'firebase-admin/firestore';
import { applyInvitationAnswer } from '@okr/shared-util-core';
import { AvatarInfo, Attendee } from '@okr/shared-models';

import { answerFunctionUrl, invitationLinkSecret, isAnswerChoice, verifyAnswer } from './answer-link';
import { eventUrl, tenantLinks } from './deliver';
import { AnswerableEvent, InvitationDoc } from './invitation';
import { answerConfirmPage, answerResultPage, eventWhen, locationLabel } from './mail';
import { todayStoreDate } from './recipients';
import { toStoreDateTime } from '../srv/zurich-time';

const REGION = 'europe-west6';
const CF_NAME = 'invitationAnswer';

export type AnswerRefusal = 'invalid' | 'gone' | 'locked' | 'eventGone' | 'past';

export const REFUSAL_TEXT: Record<AnswerRefusal, { title: string; message: string }> = {
  invalid:   { title: 'Link ungültig', message: 'Dieser Link ist nicht gültig. Öffne die Einladung bitte in der App.' },
  gone:      { title: 'Einladung nicht mehr vorhanden', message: 'Diese Einladung gibt es nicht mehr.' },
  locked:    { title: 'Antworten geschlossen', message: 'Die Antworten zu diesem Anlass sind geschlossen. Wende dich bitte an die Organisation.' },
  eventGone: { title: 'Anlass nicht mehr vorhanden', message: 'Diesen Anlass gibt es nicht mehr.' },
  past:      { title: 'Anlass vorbei', message: 'Dieser Anlass hat bereits stattgefunden.' },
};

/** Whether the invitation may still be answered (undefined = yes). Signature checking is separate, see linkRefusal. */
export function decideAnswer(inv: InvitationDoc | undefined, event: AnswerableEvent | undefined, today: string): AnswerRefusal | undefined {
  if (!inv || inv.isArchived) return 'gone';
  if (inv.isLocked) return 'locked';
  if (!event || event.isArchived) return 'eventGone';
  if ((event.startDate ?? '') < today) return 'past';
  return undefined;
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
 * locked the answers since the confirm page was shown. Returns the refusal when nothing was written.
 */
async function recordAnswer(invRef: DocumentReference, eventRef: DocumentReference, invitationKey: string, inv: FullInvitation, state: 'accepted' | 'declined', tenantId: string): Promise<AnswerRefusal | undefined> {
  const db = getFirestore();
  const now = toStoreDateTime(new Date());
  const person: AvatarInfo = {
    key: inv.inviteeKey ?? '', name1: inv.inviteeFirstName ?? '', name2: inv.inviteeLastName ?? '',
    modelType: 'person', type: '', subType: '', label: '',
  };
  const authorName = `${inv.inviteeFirstName ?? ''} ${inv.inviteeLastName ?? ''}`.trim();

  return db.runTransaction(async (tx): Promise<AnswerRefusal | undefined> => {
    const [freshInv, freshEvent] = await Promise.all([tx.get(invRef), tx.get(eventRef)]);
    const refusal = decideAnswer(
      freshInv.exists ? (freshInv.data() as InvitationDoc) : undefined,
      freshEvent.exists ? (freshEvent.data() as AnswerableEvent) : undefined,
      todayStoreDate(),
    );
    if (refusal) return refusal;
    const attendees = (freshEvent.data()?.['attendees'] as Attendee[] | undefined) ?? [];
    tx.update(invRef, { state, respondedAt: now });
    tx.update(eventRef, { attendees: applyInvitationAnswer(attendees, person, state) });
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
    return undefined;
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
    let appName = '';
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
      const links = tenantId ? await tenantLinks(tenantId) : { appName: '', appUrl: '' };
      appName = links.appName;

      const refuse = (reason: AnswerRefusal, status = 200): void => {
        res.status(status).send(answerResultPage({ appName: links.appName, ...REFUSAL_TEXT[reason] }));
      };

      const answerValid = isAnswerChoice(answer);
      const signatureValid = !!inv && answerValid
        && verifyAnswer(invitationKey, inv.inviteeKey ?? '', answer, signature, invitationLinkSecret.value());
      const badLink = linkRefusal(!!inv, answerValid, signatureValid);
      if (badLink) { refuse(badLink.reason, badLink.status); return; }
      // unreachable after linkRefusal — only here so TypeScript narrows the types
      if (!inv || !invRef || !answerValid) { refuse('invalid', 403); return; }

      const caleventKey = inv.caleventKey ?? '';
      const eventRef = caleventKey ? db.collection('calevents').doc(caleventKey) : undefined;
      const eventSnap = eventRef ? await eventRef.get() : undefined;
      const event = eventSnap?.exists ? (eventSnap.data() as AnswerableEvent) : undefined;
      const refusal = decideAnswer(inv, event, todayStoreDate());
      if (refusal || !eventRef) { refuse(refusal ?? 'eventGone'); return; }

      if (req.method === 'GET') {
        res.status(200).send(answerConfirmPage({
          appName: links.appName,
          eventName: event?.name ?? '',
          when: eventWhen(event?.startDate, event?.startTime),
          location: locationLabel(event?.locationKey),
          answer, postUrl: answerFunctionUrl(projectID.value()), invitationKey, signature,
        }));
        return;
      }

      const state = answer === 'accept' ? 'accepted' : 'declined';
      const lateRefusal = await recordAnswer(invRef, eventRef, invitationKey, inv, state, tenantId);
      if (lateRefusal) { refuse(lateRefusal); return; }
      logger.info(`${CF_NAME}: recorded ${state} for one invitation (tenant ${tenantId})`);

      res.status(200).send(answerResultPage({
        appName: links.appName,
        title: state === 'accepted' ? 'Danke für deine Zusage' : 'Danke für deine Rückmeldung',
        message: state === 'accepted' ? 'Du bist für den Anlass angemeldet.' : 'Du hast für den Anlass abgesagt.',
        eventUrl: links.appUrl ? eventUrl(links, caleventKey) : undefined,
      }));
    } catch (err) {
      // Never log the invitation key, signature, or any name/email — only that it failed.
      logger.error(`${CF_NAME}: failed`, err);
      if (res.headersSent) return;
      res.status(500).send(answerResultPage({
        appName,
        title: 'Das hat nicht geklappt',
        message: 'Deine Antwort konnte nicht gespeichert werden. Versuch es bitte nochmals oder antworte in der App.',
      }));
    }
  },
);
