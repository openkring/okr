// apps/functions/src/email/mail-page/mail-page.ts
//
// Firestore I/O around a Versand mail page (spec 1.172): load page + sections + event lines and render, and the
// nightly reap of unsent drafts. The rules themselves are pure, in mail-page.logic.ts.
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { CalEventCollection, MailPageCollection, MailPageSectionCollection } from '@okr/shared-models';
import type { CalEventModel, MailPageModel } from '@okr/shared-models';
import { DateFormat, getTodayStr, MAX_MAIL_EVENTS, publicAppOrigin, upcomingEventLines, type MailEventLine } from '@okr/shared-util-core';

import { mailColorOf } from '../../_shared/brand-color';
import { sanitizeEmailBody } from '../../pdf/sanitize';
import { mailCalendarKeys, renderMailContent, type MailContent } from './mail-content';
import { isReapableDraft, MAIL_PAGE_DRAFT_DAYS, mailPageRefusal } from './mail-page.logic';
import { MailPageError, orderedMailSections, type MailSection } from './render-mail-page.logic';

const REFUSAL_TEXT = {
  'not-found': 'Die Mailseite existiert nicht.',
  foreign: 'Die Mailseite gehört nicht zu dir.',
  sent: 'Die Mailseite wurde schon versendet.',
} as const;

/** Reads the page, its sections and the event lines of its sections and blocks, and renders the content of the mail. */
export async function renderMailPage(tenantId: string, pageKey: string, uid: string): Promise<MailContent & { page: MailPageModel }> {
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
  const loadLines = async (calendarKey: string): Promise<[string, MailEventLine[]]> => {
    const evSnap = await db.collection(CalEventCollection).where('calendars', 'array-contains', calendarKey).get();
    const rows = evSnap.docs
      .map((d) => ({ ...d.data(), okey: d.id }) as CalEventModel)
      .filter((e) => e.tenants?.includes(tenantId));
    // loaded once per calendar at the cap; each section or block lists its own maxEvents of them (mailEventLimit)
    return [calendarKey, upcomingEventLines(rows, today, MAX_MAIL_EVENTS)];
  };
  // only of what the page shows
  const events = await Promise.all(mailCalendarKeys(orderedMailSections(page.sections ?? [], sections)).map(loadLines));

  const appConfig = (await db.collection('app-config').doc(tenantId).get()).data();
  const appOrigin = publicAppOrigin(appConfig?.['appDomain'] as string | undefined, tenantId);

  const { default: hb } = await import('handlebars');
  const content = await renderMailContent(page.sections ?? [], sections, {
    hb, sanitize: sanitizeEmailBody, events: Object.fromEntries(events), appOrigin, color: mailColorOf(appConfig?.['brandColor']),
  });
  return { ...content, page };
}

/** Nightly: deletes drafts that were never sent and not edited for 30 days (`changedAt`, else `createdAt`) — sections first, then the page. */
export async function runMailPageDraftReap(): Promise<void> {
  const db = getFirestore();
  const nowIso = new Date().toISOString();
  // single-field range on createdAt, no composite index: normally changedAt ≥ createdAt, so a page edited later is
  // older by createdAt and this is a superset; the changedAt rule and the mailingKey check stay in isReapableDraft
  const cutoffIso = new Date(Date.parse(nowIso) - MAIL_PAGE_DRAFT_DAYS * 86_400_000).toISOString();
  const old = await db.collection(MailPageCollection).where('createdAt', '<', cutoffIso).get();
  let deleted = 0;
  for (const d of old.docs) {
    const page = d.data() as MailPageModel;
    if (!isReapableDraft(page, nowIso)) continue;
    try {
      const sections = await d.ref.collection(MailPageSectionCollection).listDocuments();
      for (let i = 0; i < sections.length; i += 500) {
        const batch = db.batch();
        for (const ref of sections.slice(i, i + 500)) batch.delete(ref);
        await batch.commit();
      }
      await d.ref.delete();
      deleted++;
    } catch (e) {
      logger.warn(`mailPageDraftReap: draft ${d.id} not deleted`, e);
    }
  }
  logger.info(`mailPageDraftReap: deleted ${deleted} draft page(s)`);
}
