// apps/functions/src/email/mail-page/mail-page.ts
//
// Firestore I/O around a Versand mail page (spec 1.171): load page + sections + event lines and render, and the
// nightly reap of unsent drafts. The rules themselves are pure, in mail-page.logic.ts.
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { CalEventCollection, MailPageCollection, MailPageSectionCollection } from '@okr/shared-models';
import type { CalEventModel, MailPageModel } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { sanitizeEmailBody } from '../../pdf/sanitize';
import { isReapableDraft, mailPageRefusal, upcomingEventLines } from './mail-page.logic';
import { MailPageError, renderMailPageContent, type MailEventLine, type MailSection } from './render-mail-page.logic';

/** How many upcoming events an events section lists. */
const MAX_EVENTS = 10;

const REFUSAL_TEXT = {
  'not-found': 'Die Mailseite existiert nicht.',
  foreign: 'Die Mailseite gehört nicht zu dir.',
  sent: 'Die Mailseite wurde schon versendet.',
} as const;

/** Reads the page, its sections and the event lines, and renders the content HTML of the mail. */
export async function renderMailPage(
  tenantId: string,
  pageKey: string,
  uid: string,
): Promise<{ html: string; page: MailPageModel }> {
  const db = getFirestore();
  const pageRef = db.collection(MailPageCollection).doc(pageKey);
  const snap = await pageRef.get();
  const page = snap.exists ? ({ ...snap.data(), okey: snap.id } as MailPageModel) : undefined;
  const refusal = mailPageRefusal(page, { tenantId, uid });
  if (refusal || !page) {
    const code = refusal ?? 'not-found';
    throw new MailPageError(REFUSAL_TEXT[code as keyof typeof REFUSAL_TEXT] ?? 'Die Mailseite ist nicht verfügbar.', code);
  }

  const sectionSnap = await pageRef.collection(MailPageSectionCollection).get();
  const sections = sectionSnap.docs.map((d) => ({ ...d.data(), okey: d.id }) as MailSection);

  const today = getTodayStr(DateFormat.StoreDate);
  const events: Record<string, MailEventLine[]> = {};
  for (const s of sections) {
    if (s.type !== 'events' || !s.name || events[s.name]) continue;
    const evSnap = await db.collection(CalEventCollection).where('calendars', 'array-contains', s.name).get();
    const rows = evSnap.docs
      .map((d) => ({ ...d.data(), okey: d.id }) as CalEventModel)
      .filter((e) => e.tenants?.includes(tenantId));
    events[s.name] = upcomingEventLines(rows, today, MAX_EVENTS);
  }

  const { default: hb } = await import('handlebars');
  const html = await renderMailPageContent(page.sections ?? [], sections, { hb, sanitize: sanitizeEmailBody, events });
  return { html, page };
}

/** Nightly: deletes drafts that were never sent after 7 days — sections first, then the page. */
export async function runMailPageDraftReap(): Promise<void> {
  const db = getFirestore();
  const nowIso = new Date().toISOString();
  const all = await db.collection(MailPageCollection).get();
  let deleted = 0;
  for (const d of all.docs) {
    const page = d.data() as MailPageModel;
    if (!isReapableDraft(page, nowIso)) continue;
    const sections = await d.ref.collection(MailPageSectionCollection).listDocuments();
    for (let i = 0; i < sections.length; i += 500) {
      const batch = db.batch();
      for (const ref of sections.slice(i, i + 500)) batch.delete(ref);
      await batch.commit();
    }
    await d.ref.delete();
    deleted++;
  }
  logger.info(`mailPageDraftReap: deleted ${deleted} draft page(s)`);
}
