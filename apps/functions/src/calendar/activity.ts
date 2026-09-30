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
// Comments are delivered by each recipient's `newsDelivery` (spec 1.73 §5) — push and/or
// email, via `notifyPersons`. Documents stay push-only: ambient activity, not an
// announcement — a direct message per uploaded photo would be noise.
//
// The push carries no `badgeCount` (see the head of `srv/push.ts`) and one `channelId` per
// event, so five files uploaded in a row collapse into ONE banner instead of stacking five.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { pushToPersons } from '../srv/push';
import { commentEmail, eventWhen, locationLabel } from './mail';
import { eventUrl, notifyPersons, tenantLinks, TenantLinks } from './deliver';
import {
  caleventDeepLink,
  caleventKeyFromFolders,
  caleventKeyFromParent,
  CalEventNotifyDoc,
  resolveCalEventRecipients,
  shorten,
  todayStoreDate,
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
  email?: (event: CalEventNotifyDoc & { location?: string }, links: TenantLinks) => { subject: string; html: string },
): Promise<void> {
  const { events, personKeys } = await resolveCalEventRecipients(
    caleventKey, 'event', todayStoreDate(), [authorKey]);

  const event = events[0];
  if (!event) {
    logger.warn(`${context}: calevent ${caleventKey} not found`);
    return;
  }
  // A cancelled event still gets its activity through: "wir treffen uns trotzdem" is exactly
  // the kind of message that follows a cancellation.
  if (event.isArchived || personKeys.length === 0) return;
  const tenantId = event.tenants?.[0] ?? '';
  if (!tenantId) {
    logger.warn(`${context}: calevent ${caleventKey} has no tenant`);
    return;
  }

  if (email) {
    const links = await tenantLinks(tenantId);
    await notifyPersons({
      personKeys,
      tenantId,
      ruleKey: `calevent:${caleventKey}`,
      context,
      push: { type: 'calevent', tenantId, title: event.name ?? '', body, url: caleventDeepLink(caleventKey), channelId: `calevent.${caleventKey}` },
      email: () => email(event, links),
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

/** A new comment on a calendar event notifies its participants. */
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
      (event, links) => commentEmail({
        appName: links.appName,
        eventName: event.name ?? '',
        when: eventWhen(event.startDate, event.startTime),
        location: locationLabel(event.locationKey),
        authorName: author,
        comment: comment.description ?? '',
        eventUrl: eventUrl(links, caleventKey),
      }));
  },
);

/** A new document on a calendar event notifies its participants. */
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
