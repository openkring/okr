import { randomBytes, randomUUID } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';

import {
  AvatarInfo, JournalChangeCollection, JournalCollection, JournalCommentCollection, JournalFootprintCollection, JournalGuestLink,
  JournalGuestLinksDoc, JournalGuestSeqDoc, JournalImageCollection, JournalPrivateCollection, JournalReactionCollection,
  JournalSectionCollection, PersonCollection,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { findGuestLink, guestChangeRecord, guestLinkState, likeKey } from '@okr/travel-journal-util';

import { IMGIX_PRIVATE_HOST, signImgixUrl } from '../_storage/imgix-sign';
import { tenantLinks } from '../calendar/deliver';
import { windowExpiry } from '../video/video-sign.util';
import { applyManage, deliveryFor, GuestRequest, GuestRequestError, isGuestVisibleSection, ManageAction, memberName, newLinkCode, parseGuestRequest } from './guest.logic';
import { isJournalKey } from './apply-journal-change.logic';
import { requireJournalAuthor } from './journal-auth';
import { checkNotice } from './notify.logic';
import { NoticeTooSoon, previewNotice, sendNotice } from './notify';
import { journalSenderToken } from './signal';

const REGION = 'europe-west6';
const imgixPrivateToken = defineSecret('IMGIX_PRIVATE_TOKEN');
/** europe-west6 has no CPU quota left (memory «functions deploy CPU quota»): small and few instances. */
const SMALL = { region: REGION, cpu: 'gcf_gen1' as const, memory: '256MiB' as const, maxInstances: 2 };

type Data = Record<string, unknown>;
const privateDoc = (db: Firestore, jk: string, doc: string) => db.doc(`${JournalCollection}/${jk}/${JournalPrivateCollection}/${doc}`);
const sub = (db: Firestore, jk: string, collection: string) => db.collection(`${JournalCollection}/${jk}/${collection}`);
const linksOf = (data: Data | undefined): JournalGuestLink[] => (Array.isArray(data?.['links']) ? (data['links'] as JournalGuestLink[]) : []);

/** The person document, only when the person belongs to the tenant (a link never reaches other tenants' persons). */
async function personInTenant(db: Firestore, personKey: string, tenants: string[]): Promise<Data | undefined> {
  const person = (await db.collection(PersonCollection).doc(personKey).get()).data();
  const personTenants = Array.isArray(person?.['tenants']) ? (person['tenants'] as string[]) : [];
  return person && tenants.some((t) => personTenants.includes(t)) ? person : undefined;
}

interface GuestContext { journal: Data; tenants: string[]; link: JournalGuestLink; authors: AvatarInfo[]; guests: { person: AvatarInfo }[]; name: string }

/** The journal, the caller's link and their display name — or an HttpsError for a refused link. */
async function guestContext(db: Firestore, req: GuestRequest): Promise<GuestContext> {
  const [journalSnap, linksSnap] = await Promise.all([db.collection(JournalCollection).doc(req.journalKey).get(), privateDoc(db, req.journalKey, JournalGuestLinksDoc).get()]);
  const journal = journalSnap.data();
  if (!journal || journal['isArchived'] === true) throw new HttpsError('not-found', 'journal');
  const link = findGuestLink(linksOf(linksSnap.data()), req.code);
  const state = guestLinkState(link, new Date().toISOString());
  if (!link || state !== 'ok') throw new HttpsError('permission-denied', `link-${state}`);
  const authors = Array.isArray(journal['authors']) ? (journal['authors'] as AvatarInfo[]) : [];
  const guests = Array.isArray(journal['guests']) ? (journal['guests'] as { person: AvatarInfo }[]) : [];
  const tenants = Array.isArray(journal['tenants']) ? (journal['tenants'] as string[]) : [];
  let name = memberName(link.personKey, authors, guests);
  if (!name) {
    // the iPad's guest record may still be on its way: the person's own name meanwhile (same tenant only)
    const person = await personInTenant(db, link.personKey, tenants);
    name = `${String(person?.['firstName'] ?? '')} ${String(person?.['lastName'] ?? '')}`.trim();
  }
  return { journal, tenants, link, authors, guests, name };
}

/** Appends a guest's change record: next seq of the guest device, server clock; the trigger materialises it. */
async function appendGuestRecord(db: Firestore, jk: string, ctx: GuestContext, entity: 'comment' | 'reaction', entityKey: string, op: 'create' | 'archive', fields: Data): Promise<void> {
  const seqRef = privateDoc(db, jk, JournalGuestSeqDoc);
  const pk = ctx.link.personKey;
  await db.runTransaction(async (tx) => {
    const seq = Number((await tx.get(seqRef)).data()?.[pk] ?? 0) + 1;
    const record = guestChangeRecord({ id: randomUUID(), journalKey: jk, personKey: pk, entity, entityKey, op, fields, seq, nowMs: Date.now() });
    tx.set(seqRef, { [pk]: seq }, { merge: true });
    tx.create(db.collection(JournalChangeCollection).doc(record.id), { ...record, tenants: ctx.tenants, uploadedAt: FieldValue.serverTimestamp() });
  });
}

async function requirePublished(db: Firestore, jk: string, footprintKey: string): Promise<void> {
  const fp = (await sub(db, jk, JournalFootprintCollection).doc(footprintKey).get()).data();
  if (!fp || fp['isArchived'] === true || fp['publishState'] !== 'published') throw new HttpsError('failed-precondition', 'footprint');
}

/** Everything a guest sees: published footprints with their blocks, photo URLs (signed, 6 h), likes, comments. */
async function guestView(db: Firestore, jk: string, ctx: GuestContext): Promise<Data> {
  const [footprints, sections, images, comments, reactions, person] = await Promise.all([
    sub(db, jk, JournalFootprintCollection).where('publishState', '==', 'published').get(),
    sub(db, jk, JournalSectionCollection).get(),
    sub(db, jk, JournalImageCollection).get(),
    sub(db, jk, JournalCommentCollection).get(),
    sub(db, jk, JournalReactionCollection).get(),
    db.collection(PersonCollection).doc(ctx.link.personKey).get(),
  ]);
  const live = <T extends { data: () => Data }>(docs: T[]) => docs.filter((d) => d.data()['isArchived'] !== true);
  const expires = Math.floor(windowExpiry(Date.now()) / 1000);
  const token = imgixPrivateToken.value();
  const imageById = new Map(live(images.docs).map((d) => [d.id, d.data()]));
  const name = (personKey: string) => memberName(personKey, ctx.authors, ctx.guests) || (personKey === ctx.link.personKey ? ctx.name : '');
  const pk = ctx.link.personKey;

  const result = live(footprints.docs).map((f) => {
    const fp = f.data();
    const parentKey = `page.${f.id}`;
    const order = (fp['sections'] as string[] | undefined) ?? [];
    const blocks = live(sections.docs).filter((s) => isGuestVisibleSection(s.data()) && s.data()['footprintKey'] === f.id)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .map((s) => {
        const section = s.data();
        const imageKeys = ((section['properties'] as Data | undefined)?.['images'] as { label?: string }[] | undefined ?? []).map((i) => i.label ?? '');
        const html = String((section['content'] as Data | undefined)?.['htmlContent'] ?? '');
        const photos = imageKeys.map((key) => ({ key, image: imageById.get(key) })).filter((x) => x.image && x.image['path2048'])
          .map(({ key, image }) => ({
            key, width: image?.['width'], height: image?.['height'], latitude: image?.['latitude'], longitude: image?.['longitude'], takenAt: image?.['takenAt'],
            url: signImgixUrl(IMGIX_PRIVATE_HOST, token, String(image?.['path2048']), { w: 1600, auto: 'format', expires }),
            thumb: signImgixUrl(IMGIX_PRIVATE_HOST, token, String(image?.['path400']), { w: 400, auto: 'format', expires }),
          }));
        return { key: s.id, kind: imageKeys.length > 0 && html === '' ? 'photos' : 'text', authorName: name(String(section['authorKey'] ?? '')), html, photos };
      });
    const likes = live(reactions.docs).filter((r) => r.data()['parentKey'] === parentKey).map((r) => String(r.data()['personKey']));
    const footprintComments = live(comments.docs).filter((c) => c.data()['parentKey'] === parentKey)
      .map((c) => ({
        key: c.id, authorName: name(String(c.data()['authorKey'] ?? '')) || String(c.data()['authorName'] ?? ''),
        text: String(c.data()['description'] ?? ''), createdAt: String(c.data()['creationDateTime'] ?? ''), mine: c.data()['authorKey'] === pk,
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return {
      key: f.id, title: fp['title'] ?? '', placeName: fp['placeName'] ?? '', date: fp['date'] ?? '', time: fp['time'] ?? '',
      latitude: fp['latitude'], longitude: fp['longitude'], weather: fp['weather'], transport: fp['transport'], blocks, likes: likes.length, liked: likes.includes(pk), comments: footprintComments,
    };
  }).sort((a, b) => (`${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1));

  const delivery = (person.data()?.['newsDelivery'] as unknown[] | undefined) ?? undefined;
  const channel = Array.isArray(delivery) ? (delivery.includes('signal') ? 'signal' : delivery.includes('email') ? 'email' : 'none') : 'email';
  return {
    journal: { key: jk, title: ctx.journal['title'] ?? '', subTitle: ctx.journal['subTitle'] ?? '' },
    me: { personKey: pk, name: ctx.name, channel, muted: !!ctx.link.mutedAt, expiresAt: ctx.link.expiresAt ?? '' },
    footprints: result,
  };
}

/**
 * Everything a guest does (spec 1.113 §7, plans 7, 8): no account, the link code is the credential. Actions:
 * view, comment, deleteComment (own only), like, unlike, settings (delivery channel), mute, unmute. App Check enforced.
 */
export const journalGuest = onCall(
  { ...SMALL, enforceAppCheck: true, cors: true, secrets: [imgixPrivateToken] },
  async (request: CallableRequest<unknown>): Promise<Data> => {
    checkAppCheckToken(request as never, 'journalGuest');
    let req: GuestRequest;
    try {
      req = parseGuestRequest(request.data);
    } catch (error) {
      if (error instanceof GuestRequestError) throw new HttpsError('invalid-argument', error.message);
      throw error;
    }
    const db = getFirestore();
    const ctx = await guestContext(db, req);
    const pk = ctx.link.personKey;
    switch (req.action) {
      case 'view':
        return guestView(db, req.journalKey, ctx);
      case 'comment':
        await requirePublished(db, req.journalKey, req.footprintKey as string);
        await appendGuestRecord(db, req.journalKey, ctx, 'comment', randomUUID(), 'create',
          { footprintKey: req.footprintKey, text: req.text, authorName: ctx.name, createdAt: new Date().toISOString() });
        return { ok: true };
      case 'deleteComment': {
        // only the guest's own comment: its materialised document names the author
        const comment = (await sub(db, req.journalKey, JournalCommentCollection).doc(req.commentKey as string).get()).data();
        if (!comment || comment['isArchived'] === true || comment['authorKey'] !== pk) throw new HttpsError('permission-denied', 'comment');
        await appendGuestRecord(db, req.journalKey, ctx, 'comment', req.commentKey as string, 'archive', {});
        return { ok: true };
      }
      case 'like':
      case 'unlike':
        await requirePublished(db, req.journalKey, req.footprintKey as string);
        await appendGuestRecord(db, req.journalKey, ctx, 'reaction', likeKey(req.footprintKey as string, pk), req.action === 'like' ? 'create' : 'archive',
          req.action === 'like' ? { footprintKey: req.footprintKey, type: 'like', createdAt: new Date().toISOString() } : {});
        return { ok: true };
      case 'settings':
        if (!(await personInTenant(db, pk, ctx.tenants))) throw new HttpsError('failed-precondition', 'person');
        await db.collection(PersonCollection).doc(pk).set({ newsDelivery: deliveryFor(req.channel ?? 'email') }, { merge: true });
        return { ok: true };
      case 'mute':
      case 'unmute': {
        const ref = privateDoc(db, req.journalKey, JournalGuestLinksDoc);
        await db.runTransaction(async (tx) => {
          const links = linksOf((await tx.get(ref)).data()).map((l) => {
            if (l.linkCode !== req.code) return l;
            const next = { ...l };
            if (req.action === 'mute') next.mutedAt = next.mutedAt ?? new Date().toISOString();
            else delete next.mutedAt;
            return next;
          });
          tx.set(ref, { links }, { merge: true });
        });
        logger.info(`journalGuest: ${req.action} in ${req.journalKey}`);
        return { ok: true };
      }
    }
  },
);

/**
 * Guests of a journal for its authors (plans 7, 8): links — list, create (or reuse a live one), expiry, revoke;
 * notices — `previewNotice` (what changed since the last notice, the proposed text, who would receive it) and
 * `sendNotice` (the author's possibly changed text to every live, unmuted guest). The link codes live in
 * `journals/{jk}/private/guestLinks`, which no client can read.
 */
export const manageJournalGuest = onCall(
  { ...SMALL, timeoutSeconds: 300, enforceAppCheck: true, cors: true, secrets: [journalSenderToken] },
  async (request: CallableRequest<unknown>): Promise<Data> => {
    checkAppCheckToken(request as never, 'manageJournalGuest');
    checkAuthentication(request as never, 'manageJournalGuest');
    const d = (typeof request.data === 'object' && request.data !== null ? request.data : {}) as Data;
    const db = getFirestore();
    const caller = await requireJournalAuthor(db, request.auth?.uid ?? '', d['journalKey']);
    const action = d['action'];
    const appUrl = (await tenantLinks(caller.tenantId)).appUrl;
    const url = (code: string) => `${appUrl}/g/${caller.journalKey}/${code}`;
    const view = (l: JournalGuestLink) => ({ personKey: l.personKey, url: url(l.linkCode), expiresAt: l.expiresAt ?? '', revokedAt: l.revokedAt ?? '', mutedAt: l.mutedAt ?? '' });
    const ref = privateDoc(db, caller.journalKey, JournalGuestLinksDoc);
    if (action === 'list') return { links: linksOf((await ref.get()).data()).map(view) };
    if (action === 'previewNotice' || action === 'sendNotice') {
      const journal = (await db.collection(JournalCollection).doc(caller.journalKey).get()).data() ?? {};
      if (action === 'previewNotice') return { ...(await previewNotice(db, caller.journalKey, journal, caller.tenantId)) };
      const notice = checkNotice(d['subject'], d['text']);
      if (!notice) throw new HttpsError('invalid-argument', 'notice');
      try {
        return { sent: await sendNotice(db, caller.journalKey, caller.tenantId, notice) };
      } catch (error) {
        if (error instanceof NoticeTooSoon) throw new HttpsError('resource-exhausted', 'notice-too-soon');
        throw error;
      }
    }
    if (action !== 'create' && action !== 'expiry' && action !== 'revoke') throw new HttpsError('invalid-argument', 'action');
    const personKey = d['personKey'];
    if (!isJournalKey(personKey)) throw new HttpsError('invalid-argument', 'personKey');
    // a guest is a person of the journal's tenant — never a link to another tenant's person
    if (action === 'create' && !(await personInTenant(db, personKey, [caller.tenantId]))) throw new HttpsError('failed-precondition', 'person not in tenant');
    const expiresAt = typeof d['expiresAt'] === 'string' && !Number.isNaN(Date.parse(d['expiresAt'])) ? new Date(d['expiresAt']).toISOString() : null;
    const link = await db.runTransaction(async (tx) => {
      const result = applyManage(linksOf((await tx.get(ref)).data()), action as ManageAction, personKey, new Date().toISOString(),
        () => newLinkCode(() => randomBytes(16).toString('hex')), expiresAt);
      tx.set(ref, { links: result.links, tenants: [caller.tenantId] }, { merge: true });
      return result.link;
    });
    if (!link) throw new HttpsError('not-found', 'no live link');
    return { link: view(link) };
  },
);
