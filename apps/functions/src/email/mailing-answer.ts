// apps/functions/src/email/mailing-answer.ts
//
// Answering a Versand's events from the mail's personal link, without logging in (spec 1.73 §4).
// One link per recipient (mailing + person, signed); the page lists every event of the Versand with
// its own two buttons. GET never writes (mail scanners open every link); the POST re-checks
// signature and event and writes what invitationAnswer writes — the attendee entry of the event
// (applyInvitationAnswer, in a transaction) and, when the person also holds an invitation to that
// event, its state + respondedAt and the answer comment.

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { projectID } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { applyInvitationAnswer, getEventLocationName } from '@okr/shared-util-core';
import { AvatarInfo, Attendee } from '@okr/shared-models';
import { splitAttendees } from '@okr/calendar-calevent-util';

import { isAnswerChoice, invitationLinkSecret, mailingAnswerFunctionUrl, verifyMailing } from '../calendar/answer-link';
import { answerCommentDoc, answerResultText } from '../calendar/answer';
import { brandOf, NO_TENANT_LINKS, tenantLinks } from '../calendar/deliver';
import { AnswerableEvent, eventInTenant, InvitationDoc } from '../calendar/invitation';
import { answerResultPage, Brand, eventWhen, mailingAnswerPage, MailingAnswerEvent, PAGE_CONTENT_SLOT } from '../calendar/mail';
import { todayStoreDate } from '../calendar/recipients';
import { AnswerRefusal, REFUSAL_TEXT } from '../calendar/refusal';
import { toStoreDateTime } from '../srv/zurich-time';
import { ANSWER_PAGE_CSP, attendeeStateOf, eventRefusal, invitationRefusal, mayAnswer, neutralizeMeta } from './mailing-answer.logic';
import { MailingDoc } from './mailing';
import { renderEmail } from './render-email';

const CF_NAME = 'mailingAnswer';

/** GET reads the query (the email link), POST only the form body (the answer page). */
function param(req: { method: string; query: Record<string, unknown>; body?: Record<string, unknown> }, name: string): string {
  const value = req.method === 'POST' ? req.body?.[name] : req.query[name];
  return typeof value === 'string' ? value : '';
}

interface PersonNames { firstName?: string; lastName?: string }
type EventData = AnswerableEvent & { attendees?: Attendee[]; maxAttendees?: number };

/** The event, only when it belongs to the Versand's tenant. */
function eventOf(data: unknown, tenants: string[]): EventData | undefined {
  return eventInTenant(data, tenants) as EventData | undefined;
}

/**
 * The page in the tenant's standard email layout, so it opens with the same header (logo band) as the mail
 * that led here. Without a usable standard layout the page keeps its built-in banner. The layout is
 * tenant-editable, so the page is served with ANSWER_PAGE_CSP (no script runs).
 */
async function pageFrame(tenantId: string): Promise<string | undefined> {
  try {
    const { html } = await renderEmail({ tenantId, layout: 'standard', body: PAGE_CONTENT_SLOT, noPlainFallback: true });
    return html.includes(PAGE_CONTENT_SLOT) ? neutralizeMeta(html) : undefined;
  } catch (err) {
    logger.warn(`${CF_NAME}: no standard layout for the page, using the built-in banner`, err);
    return undefined;
  }
}

export const mailingAnswer = onRequest(
  { region: 'europe-west6', secrets: [invitationLinkSecret], cors: false, maxInstances: 10 },
  async (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    // The page frame is the tenant-editable email layout: no script of any kind, forms only back to this function.
    res.set('Content-Security-Policy', ANSWER_PAGE_CSP);
    if (req.method !== 'GET' && req.method !== 'POST') { res.set('Allow', 'GET, POST'); res.status(405).send(''); return; }

    // Everything below can throw (Firestore/tenantLinks failure, transaction contention); an
    // uncaught throw in a bare onRequest would be a raw framework crash page, not the branded one.
    let brand: Brand = { appName: '' };
    try {
      const params = { method: req.method, query: req.query as Record<string, unknown>, body: req.body as Record<string, unknown> | undefined };
      const mailingKey = param(params, 'm');
      const personKey = param(params, 'p');
      const signature = param(params, 's');
      const db = getFirestore();
      const mailingSnap = mailingKey ? await db.collection('mailings').doc(mailingKey).get() : undefined;
      const doc = mailingSnap?.exists ? (mailingSnap.data() as MailingDoc) : undefined;
      const tenantId = doc?.tenants?.[0] ?? '';
      const links = tenantId ? await tenantLinks(tenantId) : NO_TENANT_LINKS;
      brand = { ...brandOf(links), ...(tenantId ? { frame: await pageFrame(tenantId) } : {}) };

      const refuse = (reason: AnswerRefusal, status = 200): void => {
        res.status(status).send(answerResultPage({ ...brand, ...REFUSAL_TEXT[reason] }));
      };

      // The signature is checked against exactly the m/p loaded below, never another key.
      const today = todayStoreDate();
      if (!doc || !personKey || !verifyMailing(mailingKey, personKey, signature, invitationLinkSecret.value())) { refuse('invalid', 403); return; }
      const caleventKeys = doc.caleventKeys ?? [];
      if (doc.validUntil && today > doc.validUntil) { refuse('past'); return; }
      if (!mayAnswer(doc, personKey, today)) { refuse('invalid', 403); return; }

      const [personSnap, eventSnaps] = await Promise.all([
        db.collection('persons').doc(personKey).get(),
        Promise.all(caleventKeys.map((key) => db.collection('calevents').doc(key).get())),
      ]);
      const names = (personSnap.data() ?? {}) as PersonNames;
      const events = new Map<string, EventData | undefined>(
        caleventKeys.map((key, i) => [key, eventOf(eventSnaps[i].data(), doc.tenants)]),
      );

      const page = (message?: string): string => mailingAnswerPage({
        ...brand,
        firstName: names.firstName ?? '',
        postUrl: mailingAnswerFunctionUrl(projectID.value()),
        mailingKey, personKey, signature, message,
        events: caleventKeys.map((key): MailingAnswerEvent => {
          const event = events.get(key);
          const refusal = eventRefusal(key, caleventKeys, event, today);
          return {
            caleventKey: key,
            name: event && refusal !== 'eventGone' ? (event.name ?? '') : REFUSAL_TEXT.eventGone.title,
            when: event && refusal !== 'eventGone' ? eventWhen(event.startDate, event.startTime) : '',
            location: event && refusal !== 'eventGone' ? getEventLocationName(event) : '',
            state: attendeeStateOf(event?.attendees, event?.maxAttendees, personKey),
            refusal,
          };
        }),
      });

      if (req.method === 'GET') { res.status(200).send(page()); return; }

      const caleventKey = param(params, 'e');
      const answer = param(params, 'a');
      if (!isAnswerChoice(answer)) { refuse('invalid', 403); return; }
      const early = eventRefusal(caleventKey, caleventKeys, events.get(caleventKey), today);
      if (early === 'invalid') { refuse('invalid', 403); return; }
      if (early) { res.status(200).send(page(REFUSAL_TEXT[early].message)); return; }

      const state = answer === 'accept' ? 'accepted' : 'declined';
      const eventRef = db.collection('calevents').doc(caleventKey);
      // Looked up before the transaction (queries cannot run in one after a write is planned, and
      // the set is tiny); the invitation is re-read inside it.
      const invQuery = await db.collection('invitations')
        .where('caleventKey', '==', caleventKey).where('inviteeKey', '==', personKey).where('isArchived', '==', false).get();
      const invDoc = invQuery.docs.find((d) => (d.data() as InvitationDoc).tenants?.includes(tenantId));
      const invRef = invDoc?.ref;

      const now = toStoreDateTime(new Date());
      const person: AvatarInfo = {
        key: personKey, name1: names.firstName ?? '', name2: names.lastName ?? '',
        modelType: 'person', type: '', subType: '', label: '',
      };
      const authorName = `${names.firstName ?? ''} ${names.lastName ?? ''}`.trim();

      const outcome = await db.runTransaction(async (tx): Promise<{ refusal: AnswerRefusal } | { waiting: boolean }> => {
        const [freshEvent, freshInv] = await Promise.all([tx.get(eventRef), invRef ? tx.get(invRef) : Promise.resolve(undefined)]);
        const refusal = eventRefusal(caleventKey, caleventKeys, eventInTenant(freshEvent.data(), doc.tenants), todayStoreDate());
        if (refusal) return { refusal };
        const invData = freshInv?.exists ? (freshInv.data() as InvitationDoc) : undefined;
        const invLocked = invitationRefusal(invData);
        if (invLocked) return { refusal: invLocked };
        const attendees = applyInvitationAnswer(freshEvent.data()?.['attendees'] as Attendee[] | undefined, person, state);
        tx.update(eventRef, { attendees });
        if (invRef && invData && !invData.isArchived) {
          const invitationKey = invRef.id;
          tx.update(invRef, { state, respondedAt: now });
          tx.set(db.collection('comments').doc(), answerCommentDoc(invitationKey, personKey, authorName, state, now, tenantId));
        }
        return { waiting: splitAttendees(attendees, freshEvent.data()?.['maxAttendees'] as number | undefined).waiting.some((a) => a.person.key === personKey) };
      });
      if ('refusal' in outcome) {
        // only this event is refused; the others stay answerable
        const fresh = await eventRef.get();
        events.set(caleventKey, eventOf(fresh.data(), doc.tenants));
        res.status(200).send(page(REFUSAL_TEXT[outcome.refusal].message));
        return;
      }
      logger.info(`${CF_NAME}: recorded ${state} for one mailing answer (tenant ${tenantId})`);

      // The page again, with the new state of that event: re-read it so the block shows the answer.
      const fresh = await eventRef.get();
      events.set(caleventKey, eventOf(fresh.data(), doc.tenants));
      const { title, message } = answerResultText(state, outcome.waiting);
      res.status(200).send(page(`${title}. ${message}`));
    } catch (err) {
      // Never log the keys, signature, or any name/email — only that it failed.
      logger.error(`${CF_NAME}: failed`, err);
      if (res.headersSent) return;
      res.status(500).send(answerResultPage({
        ...brand,
        title: 'Das hat nicht geklappt',
        message: 'Deine Antwort konnte nicht gespeichert werden. Versuch es bitte nochmals.',
      }));
    }
  },
);
