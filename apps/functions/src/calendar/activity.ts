// apps/functions/src/calendar/activity.ts
//
// §2 of `planning/specs/2026-08-25-participant-messaging-spec.md`: a new comment or a new
// document on a calendar event notifies its participants.
//
// Both cards (`okr-comments-accordion`, `okr-documents-accordion`) have been mounted on the
// event modals all along — they just never told anyone. Whoever did not happen to open the
// event never learned that the meeting point had changed.
//
// CREATE ONLY, and push ONLY:
//  - create only, because a corrected typo is not news;
//  - push only (no bot DM), because this is ambient activity, not an announcement. A direct
//    message per uploaded photo would be noise. The broadcast (§1) is the announcement channel.
//
// The push carries no `badgeCount` (see the head of `srv/push.ts`) and one `channelId` per
// event, so five files uploaded in a row collapse into ONE banner instead of stacking five.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

import { pushToPersons } from '../srv/push';
import {
  caleventKeyFromFolders,
  caleventKeyFromParent,
  hasTag,
  resolveCalEventRecipients,
  shorten,
  todayStoreDate,
} from './recipients';

const REGION = 'europe-west6';

/**
 * Tag on the comment a broadcast writes as its record (§1.4). It MUST NOT notify: the
 * broadcast has already pushed to exactly these people, and a second message about its own
 * receipt is the kind of duplicate that makes people mute a feature.
 */
export const BROADCAST_TAG = 'broadcast';

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

/** Deliver one calendar-activity push. Shared by both triggers. */
async function notifyAboutEvent(
  caleventKey: string,
  authorKey: string,
  body: string,
  context: string,
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

  await pushToPersons(
    personKeys,
    {
      type: 'calevent',
      title: event.name ?? '',
      body,
      url: `/calevent/${caleventKey}`,
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
    if (hasTag(comment.tags, BROADCAST_TAG)) return;           // the broadcast's own record

    const author = comment.authorName ?? '';
    const body = author ? `${author}: ${shorten(comment.description)}` : shorten(comment.description);
    await notifyAboutEvent(caleventKey, comment.authorKey ?? '', body, 'onCalEventCommentCreated');
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

    const name = document.title || document.description || (document.fullPath ?? '').split('/').pop() || '';
    const author = document.authorName ?? '';
    const body = author ? `${author} hat ${name} hinzugefügt` : `${name} hinzugefügt`;
    await notifyAboutEvent(caleventKey, document.authorKey ?? '', shorten(body), 'onCalEventDocumentCreated');
  },
);
