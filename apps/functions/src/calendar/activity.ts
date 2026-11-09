// apps/functions/src/calendar/activity.ts
//
// §2 of `planning/specs/2026-08-25-participant-messaging-spec.md`: a new comment or a new
// document on a calendar event notifies its participants.
//
// Both cards (`okr-comments-accordion`, `okr-documents-accordion`) have been mounted on the
// event modals all along — they just never told anyone. Whoever did not happen to open the
// event never learned that the meeting point had changed.
//
// CREATE ONLY, because a corrected typo is not news.
//
// WHO is told follows the event's `commentNotify` (spec 1.147): everyone, the organisers only, or
// nobody — by default the organisers only on a Versand event or one with more than 10 people.
//
// Comments are delivered by each recipient's `newsDelivery` (spec 1.73 §5) — push and/or
// email, via `notifyPersons`. Documents stay push-only: ambient activity, not an
// announcement — a direct message per uploaded photo would be noise.
//
// The push carries no `badgeCount` (see the head of `srv/push.ts`) and one `channelId` per
// event, so five files uploaded in a row collapse into ONE banner instead of stacking five.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DateFormat, getEventLocationName, getTodayStr } from '@okr/shared-util-core';
import type { EmailLayoutChoice } from '@okr/shared-models';

import { pushToPersons } from '../srv/push';
import { renderEmail } from '../email/render-email';
import { commentEmail, commentEmailContent, eventWhen } from './mail';
import { brandOf, eventUrl, notifyPersons, tenantLinks, TenantLinks } from './deliver';
import {
  caleventDeepLink,
  caleventKeyFromFolders,
  caleventKeyFromParent,
  CalEventNotifyDoc,
  commentRecipients,
  loadCalEventsInScope,
  reachableAttendeeKeys,
  resolveCommentNotify,
  shorten,
  todayStoreDate,
  VersandRef,
  versandLayout,
} from './recipients';

const REGION = 'europe-west6';

interface CommentDoc {
  parentKey?: string;
  authorKey?: string;
  authorName?: string;
  description?: string;
  tags?: string;
  isArchived?: boolean;
}

interface DocumentDoc {
  folderKeys?: string[];
  authorKey?: string;
  authorName?: string;
  description?: string;
  title?: string;
  fullPath?: string;
  isArchived?: boolean;
}

/**
 * Count the activity on the event (`activityCount`, `lastActivityAt` on the calevent doc).
 *
 * The badge on the list and the dashboard is this counter minus the user's seen marker
 * (`users/{uid}/seen/calevent.<okey>`) — so the client never loads comments to know how many
 * are new. Broadcast records count too: they are the announcement the participant most wants
 * to find on the event, even though they are not pushed a second time.
 */
async function recordActivity(caleventKey: string, context: string): Promise<void> {
  try {
    await getFirestore().collection('calevents').doc(caleventKey).update({
      activityCount: FieldValue.increment(1),
      lastActivityAt: getTodayStr(DateFormat.StoreDateTime),
    });
  } catch (err) {
    // a comment on a deleted event, or a transient failure: the badge is a convenience
    logger.warn(`${context}: could not count activity on ${caleventKey}:`, err);
  }
}

/**
 * Deliver one calendar-activity notification. Shared by both triggers.
 *
 * With no `email` builder (the document trigger), delivery stays push-only. With one (the
 * comment trigger), delivery follows each recipient's `newsDelivery` via `notifyPersons`.
 */
async function notifyAboutEvent(
  caleventKey: string,
  authorKey: string,
  body: string,
  context: string,
  email?: (event: CalEventNotifyDoc & { location?: string }, links: TenantLinks) => { subject: string; content: string; fallbackHtml: string },
): Promise<void> {
  const [event] = await loadCalEventsInScope(caleventKey, 'event', todayStoreDate());
  if (!event) {
    logger.warn(`${context}: calevent ${caleventKey} not found`);
    return;
  }
  const tenantId = event.tenants?.[0] ?? '';
  if (!tenantId) {
    logger.warn(`${context}: calevent ${caleventKey} has no tenant`);
    return;
  }
  // Who hears about it is the event's own setting (spec 1.147); a Versand of the event makes the
  // default «organisers» and lends the mail its layout.
  const reachable = reachableAttendeeKeys(event).length;
  const versand = await versandOf(caleventKey, tenantId, context);
  const mode = resolveCommentNotify(event.commentNotify, versand.isVersand, reachable);
  const personKeys = commentRecipients(event, mode, [authorKey]);
  logger.info(`${context}: ${caleventKey} notifies ${mode} (${personKeys.length} person(s))`);
  // A cancelled event still gets its activity through: "wir treffen uns trotzdem" is exactly
  // the kind of message that follows a cancellation.
  if (event.isArchived || personKeys.length === 0) return;

  if (email) {
    const links = await tenantLinks(tenantId);
    const mail = email(event, links);
    const html = await framed(tenantId, versand.layout ?? 'standard', mail.content, context) ?? mail.fallbackHtml;
    await notifyPersons({
      personKeys,
      tenantId,
      ruleKey: `calevent:${caleventKey}`,
      context,
      push: { type: 'calevent', tenantId, title: event.name ?? '', body, url: caleventDeepLink(caleventKey), channelId: `calevent.${caleventKey}` },
      email: () => ({ subject: mail.subject, html }),
    });
    return;
  }

  await pushToPersons(
    personKeys,
    {
      type: 'calevent',
      tenantId,
      title: event.name ?? '',
      body,
      url: caleventDeepLink(caleventKey),
      channelId: `calevent.${caleventKey}`,
    },
    context,
  );
}

/**
 * Whether a Versand (mailing) of the tenant asks about this event, and the layout of the newest
 * one. Such events reach hundreds of people who answered from a mass mail; a «freu mi» comment
 * must not mail all of them (2026-11-09, Fondueabend). On a lookup failure, assume a Versand:
 * telling only the organisers beats spam.
 */
async function versandOf(caleventKey: string, tenantId: string, context: string): Promise<{ isVersand: boolean; layout?: EmailLayoutChoice }> {
  try {
    const snap = await getFirestore().collection('mailings').where('caleventKeys', 'array-contains', caleventKey).get();
    const layout = versandLayout(snap.docs.map((d) => d.data() as VersandRef), tenantId);
    return { isVersand: layout !== undefined, layout };
  } catch (err) {
    logger.warn(`${context}: Versand lookup for ${caleventKey} failed, treating it as a Versand:`, err);
    return { isVersand: true };
  }
}

/**
 * The content in the tenant's email layout: the Versand's choice, else 'standard' (spec 1.147 §5.1).
 * An unusable chosen layout falls back to 'standard'; without a standard layout the caller keeps
 * its built-in banner frame — a notification is never dropped over its frame.
 */
async function framed(tenantId: string, layout: EmailLayoutChoice, content: string, context: string): Promise<string | undefined> {
  for (const choice of layout === 'standard' ? ['standard'] : [layout, 'standard']) {
    try {
      return (await renderEmail({ tenantId, layout: choice, body: content, noPlainFallback: true })).html;
    } catch (err) {
      logger.warn(`${context}: email layout ${choice} not usable for ${tenantId}:`, err);
    }
  }
  return undefined;
}

/** A new comment on a calendar event notifies whom the event's `commentNotify` names. */
export const onCalEventCommentCreated = onDocumentCreated(
  { document: 'comments/{commentId}', region: REGION },
  async (event) => {
    const comment = event.data?.data() as CommentDoc | undefined;
    if (!comment || comment.isArchived) return;

    const caleventKey = caleventKeyFromParent(comment.parentKey);
    if (!caleventKey) return;                                  // a comment on something else
    await recordActivity(caleventKey, 'onCalEventCommentCreated');

    const author = comment.authorName ?? '';
    const body = author ? `${author}: ${shorten(comment.description)}` : shorten(comment.description);
    await notifyAboutEvent(caleventKey, comment.authorKey ?? '', body, 'onCalEventCommentCreated',
      (event, links) => {
        const p = {
          ...brandOf(links),
          eventName: event.name ?? '',
          when: eventWhen(event.startDate, event.startTime),
          location: getEventLocationName(event),
          authorName: author,
          comment: comment.description ?? '',
          eventUrl: eventUrl(links, caleventKey),
        };
        return { ...commentEmailContent(p), fallbackHtml: commentEmail(p).html };
      });
  },
);

/** A new document on a calendar event notifies whom the event's `commentNotify` names (push only). */
export const onCalEventDocumentCreated = onDocumentCreated(
  { document: 'docs/{docId}', region: REGION },
  async (event) => {
    const document = event.data?.data() as DocumentDoc | undefined;
    if (!document || document.isArchived) return;

    const caleventKey = caleventKeyFromFolders(document.folderKeys);
    if (!caleventKey) return;
    await recordActivity(caleventKey, 'onCalEventDocumentCreated');

    const name = document.title || document.description || (document.fullPath ?? '').split('/').pop() || '';
    const author = document.authorName ?? '';
    const body = author ? `${author} hat ${name} hinzugefügt` : `${name} hinzugefügt`;
    await notifyAboutEvent(caleventKey, document.authorKey ?? '', shorten(body), 'onCalEventDocumentCreated');
  },
);
