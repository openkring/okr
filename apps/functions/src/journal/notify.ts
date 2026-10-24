import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { DocumentReference, Firestore, getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  JournalChange, JournalChangeCollection, JournalCollection, JournalGuestLink, JournalGuestLinksDoc, JournalNotifyDoc, JournalPrivateCollection,
  PersonCollection,
} from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getProjectedAddresses } from '@okr/shared-util-functions';
import { acceptRecord, DigestItem, digestOf, materialize } from '@okr/travel-journal-util';

import { notifyPersons, tenantLinks } from '../calendar/deliver';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { OutboxDoc, WorkflowOutboxCollection } from '../workflow/outbox';
import { chooseChannel, digestRecipients, GuestChannelChoice, guestComments, guestMessage, proposedNotice } from './notify.logic';
import { journalSenderToken, sendSignal } from './signal';

/*
 * News of the travel journals (spec 1.113 §8, plans 7 and 8). Guests are notified only when an author sends a
 * notice (manageJournalGuest previewNotice / sendNotice): the system collects what changed since the last notice
 * and proposes the text, the author may change it. The authors themselves are told about guest comments by the
 * hourly function below.
 */

type Journal = Record<string, unknown>;
const privateRef = (db: Firestore, jk: string, doc: string) => db.doc(`${JournalCollection}/${jk}/${JournalPrivateCollection}/${doc}`);

/** The accepted records uploaded after `cursor`, the merged journal and the newest upload time. */
async function newsSince(db: Firestore, journalKey: string, cursor: Timestamp | undefined): Promise<{ news: JournalChange[]; state: ReturnType<typeof materialize>; newest?: Timestamp }> {
  const accepted = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => docs
    .map((d) => ({ change: d.data() as unknown as JournalChange, at: (d.data()['uploadedAt'] as Timestamp | undefined)?.toMillis() ?? 0 }))
    .filter((r) => acceptRecord(r.change, r.at)).map((r) => r.change);
  const all = await db.collection(JournalChangeCollection).where('journalKey', '==', journalKey).orderBy('uploadedAt').get();
  const fresh = cursor ? all.docs.filter((d) => ((d.data()['uploadedAt'] as Timestamp | undefined)?.toMillis() ?? 0) > cursor.toMillis()) : all.docs;
  const newest = all.docs.length > 0 ? (all.docs[all.docs.length - 1].data()['uploadedAt'] as Timestamp) : undefined;
  return { news: accepted(fresh), state: materialize(accepted(all.docs)), newest };
}

export interface NoticePreview { items: DigestItem[]; subject: string; text: string; recipients: Record<GuestChannelChoice | 'muted', number> }

interface Recipient { link: JournalGuestLink; channel: GuestChannelChoice; email: string; phone: string }

/** Every guest with a live link, their channel and addresses — muted ones are counted, never contacted. */
async function recipientsOf(db: Firestore, journalKey: string, tenantId: string): Promise<{ recipients: Recipient[]; muted: number }> {
  const links = ((await privateRef(db, journalKey, JournalGuestLinksDoc).get()).data()?.['links'] ?? []) as JournalGuestLink[];
  const now = new Date().toISOString();
  const live = digestRecipients(links, now);
  const muted = digestRecipients(links.map((l) => ({ ...l, mutedAt: undefined })), now).length - live.length;
  const config = (await db.collection('app-config').doc(tenantId).get()).data();
  const signalEnabled = (config?.['integrations'] as Record<string, unknown> | undefined)?.['signal'] === true;
  const deps = createFirestoreDeps();
  const recipients = await Promise.all(live.map(async (link): Promise<Recipient> => {
    const person = (await db.collection(PersonCollection).doc(link.personKey).get()).data();
    const email = await deps.emailFor(link.personKey, tenantId);
    const phone = signalEnabled
      ? (await getProjectedAddresses(db, `person.${link.personKey}`, 'privileged', tenantId))
        .filter((a) => a.addressChannel === 'phone' && a.phone).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))[0]?.phone ?? ''
      : '';
    return { link, email, phone, channel: chooseChannel(person?.['newsDelivery'], signalEnabled, phone !== '', email !== '') };
  }));
  return { recipients, muted };
}

/** What changed since the last notice, the proposed text and who would receive it (nothing is sent). */
export async function previewNotice(db: Firestore, journalKey: string, journal: Journal, tenantId: string): Promise<NoticePreview> {
  const cursor = (await privateRef(db, journalKey, JournalNotifyDoc).get()).data()?.['lastNotifiedAt'] as Timestamp | undefined;
  const { news, state } = await newsSince(db, journalKey, cursor);
  const items = digestOf(news, state, journalKey);
  const { recipients, muted } = await recipientsOf(db, journalKey, tenantId);
  const count = (c: GuestChannelChoice) => recipients.filter((r) => r.channel === c).length;
  return { items, ...proposedNotice(String(journal['title'] ?? ''), items), recipients: { email: count('email'), signal: count('signal'), none: count('none'), muted } };
}

/** Sends the author's notice to every live, unmuted guest and moves the cursor. Returns how many were reached. */
export async function sendNotice(db: Firestore, journalKey: string, tenantId: string, notice: { subject: string; text: string }): Promise<{ email: number; signal: number }> {
  const appUrl = (await tenantLinks(tenantId)).appUrl;
  const { newest } = await newsSince(db, journalKey, undefined);
  const { recipients } = await recipientsOf(db, journalKey, tenantId);
  const day = getTodayStr(DateFormat.StoreDate);
  let email = 0;
  let signal = 0;
  for (const r of recipients) {
    const link = `${appUrl}/g/${journalKey}/${r.link.linkCode}`;
    const message = guestMessage(notice, link, `${link}?mute=1`);
    try {
      if (r.channel === 'signal' && (await sendSignal(db, journalKey, r.link.personKey, r.phone, message.text))) {
        signal += 1;
        continue;
      }
      if (r.channel === 'none' || !r.email) continue;
      const doc: OutboxDoc = {
        tenants: [tenantId], kind: 'sendEmail', ruleKey: `journal:${journalKey}`, day, state: 'pending',
        payload: { to: r.email, subject: message.subject, body: message.html, template: '' },
      };
      await db.collection(WorkflowOutboxCollection).add(doc);
      email += 1;
    } catch (error) {
      // one guest failing never stops the others; no address in the log
      logger.warn(`journal notice: one guest of ${journalKey} not reached`, { error: String((error as Error)?.message ?? error) });
    }
  }
  await privateRef(db, journalKey, JournalNotifyDoc).set({ lastNotifiedAt: newest ?? Timestamp.now() }, { merge: true });
  logger.info(`journal notice: ${journalKey}: ${email} email(s), ${signal} Signal message(s)`);
  return { email, signal };
}

/**
 * Hourly: tells the authors about new guest comments (push/email through notifyPersons). Guests are no longer
 * notified automatically (plan 8). The function keeps its name until the Cloud Functions consolidation renames it.
 */
export const notifyJournalGuests = onSchedule(
  { schedule: 'every 60 minutes', region: 'europe-west6', cpu: 'gcf_gen1', memory: '512MiB', maxInstances: 1, timeoutSeconds: 540, secrets: [journalSenderToken] },
  async () => {
    const db = getFirestore();
    const journals = await db.collection(JournalCollection).where('isArchived', '==', false).get();
    for (const journal of journals.docs) {
      try {
        await notifyAuthors(db, journal.id, journal.data(), privateRef(db, journal.id, JournalNotifyDoc));
      } catch (error) {
        logger.warn(`notifyJournalGuests: journal ${journal.id} failed`, { error: String((error as Error)?.message ?? error) });
      }
    }
  },
);

async function notifyAuthors(db: Firestore, journalKey: string, journal: Journal, cursorRef: DocumentReference): Promise<void> {
  const cursor = (await cursorRef.get()).data()?.['lastAuthorNotifiedAt'] as Timestamp | undefined;
  if (!cursor) {
    await cursorRef.set({ lastAuthorNotifiedAt: Timestamp.now() }, { merge: true });
    return;
  }
  const { news, newest } = await newsSince(db, journalKey, cursor);
  if (news.length === 0 || !newest) return;
  const tenantId = (journal['tenants'] as string[] | undefined)?.[0] ?? '';
  const title = String(journal['title'] ?? '');
  const authorKeys = (journal['authorKeys'] as string[] | undefined) ?? [];
  const comments = guestComments(news, authorKeys);
  if (comments.size > 0) {
    const appUrl = (await tenantLinks(tenantId)).appUrl;
    const total = [...comments.values()].reduce((n, c) => n + c, 0);
    const body = total === 1 ? 'Ein Gast hat einen Kommentar geschrieben.' : `Gäste haben ${total} Kommentare geschrieben.`;
    await notifyPersons({
      personKeys: authorKeys, tenantId, ruleKey: `journal:${journalKey}`, context: 'notifyJournalGuests',
      push: { type: 'journalComment', tenantId, title: title || 'Reisetagebuch', body, url: `/journal/${journalKey}`, channelId: `journal-${journalKey}` },
      email: () => ({ subject: `Neue Kommentare im Reisetagebuch «${title}»`, html: `<p>${body}</p><p><a href="${appUrl}/journal/${journalKey}">Zum Reisetagebuch</a></p>` }),
    });
  }
  await cursorRef.set({ lastAuthorNotifiedAt: newest }, { merge: true });
}
