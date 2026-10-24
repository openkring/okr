import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { DocumentReference, Firestore, getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  JournalChange, JournalChangeCollection, JournalCollection, JournalGuestLink, JournalGuestLinksDoc, JournalNotifyDoc,
  JournalPrivateCollection, PersonCollection,
} from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getProjectedAddresses } from '@okr/shared-util-functions';
import { acceptRecord, digestOf, materialize } from '@okr/travel-journal-util';

import { notifyPersons, tenantLinks } from '../calendar/deliver';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { OutboxDoc, WorkflowOutboxCollection } from '../workflow/outbox';
import { chooseChannel, digestRecipients, guestComments, guestDigest } from './notify.logic';
import { journalSenderToken, sendSignal } from './signal';

/**
 * Hourly news of the travel journals (spec 1.113 §8, plan 7). Per journal the change records uploaded since
 * the last run become one digest per guest (email or Signal, by the guest's own choice; muted, revoked and
 * expired links get nothing) and one message to the authors about new guest comments. The cursor
 * `private/notify.lastNotifiedAt` moves only after sending, so nothing is announced twice; the very first run
 * of a journal only sets it (no flood of old news).
 */
export const notifyJournalGuests = onSchedule(
  { schedule: 'every 60 minutes', region: 'europe-west6', cpu: 'gcf_gen1', memory: '512MiB', maxInstances: 1, timeoutSeconds: 540, secrets: [journalSenderToken] },
  async () => {
    const db = getFirestore();
    const journals = await db.collection(JournalCollection).where('isArchived', '==', false).get();
    for (const journal of journals.docs) {
      try {
        await notifyJournal(db, journal.id, journal.data());
      } catch (error) {
        logger.warn(`notifyJournalGuests: journal ${journal.id} failed`, { error: String((error as Error)?.message ?? error) });
      }
    }
  },
);

async function notifyJournal(db: Firestore, journalKey: string, journal: Record<string, unknown>): Promise<void> {
  const privateRef = (doc: string) => db.doc(`${JournalCollection}/${journalKey}/${JournalPrivateCollection}/${doc}`);
  const cursorRef = privateRef(JournalNotifyDoc);
  const cursor = (await cursorRef.get()).data()?.['lastNotifiedAt'] as Timestamp | undefined;
  if (!cursor) {
    await cursorRef.set({ lastNotifiedAt: Timestamp.now() });
    return;
  }
  const fresh = await db.collection(JournalChangeCollection).where('journalKey', '==', journalKey).where('uploadedAt', '>', cursor).orderBy('uploadedAt').get();
  if (fresh.empty) return;
  const newest = fresh.docs[fresh.docs.length - 1].data()['uploadedAt'] as Timestamp;
  const asRecord = (data: Record<string, unknown>): JournalChange => data as unknown as JournalChange;
  const accepted = (docs: typeof fresh.docs) => docs.map((d) => ({ change: asRecord(d.data()), at: (d.data()['uploadedAt'] as Timestamp | undefined)?.toMillis() ?? 0 }))
    .filter((r) => acceptRecord(r.change, r.at)).map((r) => r.change);
  const all = await db.collection(JournalChangeCollection).where('journalKey', '==', journalKey).get();
  const state = materialize(accepted(all.docs));
  const news = accepted(fresh.docs);
  const items = digestOf(news, state, journalKey);
  const tenantId = (journal['tenants'] as string[] | undefined)?.[0] ?? '';
  const title = String(journal['title'] ?? '');
  const links = await tenantLinks(tenantId);

  if (items.length > 0) await notifyGuests(db, journalKey, tenantId, title, items, links.appUrl, privateRef);

  const authorKeys = (journal['authorKeys'] as string[] | undefined) ?? [];
  const comments = guestComments(news, authorKeys);
  if (comments.size > 0) {
    const total = [...comments.values()].reduce((n, c) => n + c, 0);
    const body = total === 1 ? 'Ein Gast hat einen Kommentar geschrieben.' : `Gäste haben ${total} Kommentare geschrieben.`;
    await notifyPersons({
      personKeys: authorKeys, tenantId, ruleKey: `journal:${journalKey}`, context: 'notifyJournalGuests',
      push: { type: 'journalComment', tenantId, title: title || 'Reisetagebuch', body, url: `/journal/${journalKey}`, channelId: `journal-${journalKey}` },
      email: () => ({ subject: `Neue Kommentare im Reisetagebuch «${title}»`, html: `<p>${body}</p><p><a href="${links.appUrl}/journal/${journalKey}">Zum Reisetagebuch</a></p>` }),
    });
  }
  await cursorRef.set({ lastNotifiedAt: newest });
}

async function notifyGuests(
  db: Firestore, journalKey: string, tenantId: string, title: string, items: ReturnType<typeof digestOf>, appUrl: string,
  privateRef: (doc: string) => DocumentReference,
): Promise<void> {
  const links = ((await privateRef(JournalGuestLinksDoc).get()).data()?.['links'] ?? []) as JournalGuestLink[];
  const recipients = digestRecipients(links, new Date().toISOString());
  if (recipients.length === 0 || !appUrl) return;
  const config = (await db.collection('app-config').doc(tenantId).get()).data();
  const signalEnabled = (config?.['integrations'] as Record<string, unknown> | undefined)?.['signal'] === true;
  const deps = createFirestoreDeps();
  const day = getTodayStr(DateFormat.StoreDate);
  let mailed = 0;
  let signalled = 0;
  for (const link of recipients) {
    const personLink = `${appUrl}/g/${journalKey}/${link.linkCode}`;
    const message = guestDigest(title, items, personLink, `${personLink}?mute=1`);
    try {
      const person = (await db.collection(PersonCollection).doc(link.personKey).get()).data();
      const email = await deps.emailFor(link.personKey, tenantId);
      const phone = signalEnabled
        ? (await getProjectedAddresses(db, `person.${link.personKey}`, 'privileged', tenantId))
          .filter((a) => a.addressChannel === 'phone' && a.phone).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))[0]?.phone ?? ''
        : '';
      const channel = chooseChannel(person?.['newsDelivery'], signalEnabled, phone !== '', email !== '');
      if (channel === 'signal' && (await sendSignal(db, journalKey, link.personKey, phone, message.text))) {
        signalled += 1;
        continue;
      }
      if (channel === 'none' || !email) continue;
      const doc: OutboxDoc = {
        tenants: [tenantId], kind: 'sendEmail', ruleKey: `journal:${journalKey}`, day, state: 'pending',
        payload: { to: email, subject: message.subject, body: message.html, template: '' },
      };
      await db.collection(WorkflowOutboxCollection).add(doc);
      mailed += 1;
    } catch (error) {
      // one guest failing never stops the others; no address in the log
      logger.warn(`notifyJournalGuests: one guest of ${journalKey} not notified`, { error: String((error as Error)?.message ?? error) });
    }
  }
  logger.info(`notifyJournalGuests: ${journalKey}: ${items.length} footprint(s), ${mailed} email(s), ${signalled} Signal message(s)`);
}

