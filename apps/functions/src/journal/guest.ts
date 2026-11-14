import { randomBytes, randomUUID } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, Firestore, getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  AddressCollection, AddressModel, AvatarInfo, JournalChange, JournalChangeCollection, JournalCollection, JournalCommentCollection, JournalFootprintCollection, JournalGuestLink,
  JournalGuestLinksDoc, JournalGuestSeqDoc, JournalImageCollection, JournalPrivateCollection, JournalReactionCollection,
  JournalSectionCollection, PersonCollection,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { acceptRecord, findGuestLink, guestChangeRecord, guestLinkState, likeKey, parseParentKey, reactionKey } from '@okr/travel-journal-util';

import { IMGIX_PRIVATE_HOST, signImgixUrl } from '../_storage/imgix-sign';
import { privateBucket } from '../_storage/private-bucket';
import { tenantLinks } from '../calendar/deliver';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { windowExpiry } from '../video/video-sign.util';
import {
  applyManage, clipReadUrl, deliveryFor, feedbackIndex, FeedbackKind, feedbackTarget, GuestSection, guestReactionWrite, guestSectionFeedback, guestSectionsOf,
  guestVideoClips, GuestRequest, GuestRequestError, ManageAction, mayDeleteComment, memberName, newLinkCode, parseGuestRequest, parseGuestEmail, peopleKeys,
} from './guest.logic';
import { isJournalKey } from './apply-journal-change.logic';
import { requireJournalAuthor } from './journal-auth';
import { checkNotice } from './notify.logic';
import { NoticeTooSoon, previewNotice, sendNotice } from './notify';

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

/**
 * The footprint of a guest's comment or reaction on a section or image (decision 5), or failed-precondition: the parent
 * must be shown by a guest-visible section of a live, published footprint of this journal, with its switch on.
 */
async function requireFeedbackTarget(db: Firestore, jk: string, parentKey: string, kind: FeedbackKind): Promise<string> {
  const [footprints, sections] = await Promise.all([
    sub(db, jk, JournalFootprintCollection).where('publishState', '==', 'published').get(),
    sub(db, jk, JournalSectionCollection).get(),
  ]);
  const sectionDocs = sections.docs.map((d) => ({ id: d.id, data: d.data() }));
  const published = new Map<string, GuestSection[]>(footprints.docs.filter((f) => f.data()['isArchived'] !== true).map((f) => {
    const order = Array.isArray(f.data()['sections']) ? (f.data()['sections'] as string[]) : [];
    return [f.id, guestSectionsOf(sectionDocs, f.id, order)];
  }));
  const footprintKey = feedbackTarget(parentKey, kind, published);
  if (!footprintKey) throw new HttpsError('failed-precondition', 'parent');
  return footprintKey;
}

/**
 * Switches the guest's emoji reaction on or off: one transaction reads the guest seq and every record of the reaction's key
 * (the materialised doc may lag behind the trigger), then appends `create` while the reaction is unknown, else `set` with
 * the first `createdAt` (`guestReactionWrite`). Removing a reaction the guest never made writes nothing.
 */
async function appendGuestReaction(db: Firestore, jk: string, ctx: GuestContext, parentKey: string, footprintKey: string, emoji: string, active: boolean): Promise<void> {
  const parent = parseParentKey(parentKey);
  const pk = ctx.link.personKey;
  const key = parent && reactionKey(parent, pk, emoji);
  if (!parent || !key) throw new HttpsError('invalid-argument', 'emoji');
  const seqRef = privateDoc(db, jk, JournalGuestSeqDoc);
  const ofKey = db.collection(JournalChangeCollection).where('journalKey', '==', jk).where('entity', '==', 'reaction').where('entityKey', '==', key);
  await db.runTransaction(async (tx) => {
    const [seqSnap, recordSnaps] = await Promise.all([tx.get(seqRef), tx.get(ofKey)]);
    // as the trigger reads them: a clock more than 24 h ahead of its upload is dropped (a record still pending its timestamp counts as now)
    const records = recordSnaps.docs.map((d) => d.data() as JournalChange)
      .filter((r) => acceptRecord(r, (r.uploadedAt as unknown as Timestamp | undefined)?.toMillis?.() ?? Date.now()));
    const write = guestReactionWrite(records, parent, footprintKey, pk, emoji, active, new Date().toISOString());
    if (!write) return;
    const seq = Number(seqSnap.data()?.[pk] ?? 0) + 1;
    const record = guestChangeRecord({ id: randomUUID(), journalKey: jk, personKey: pk, entity: 'reaction', entityKey: write.entityKey, op: write.op, fields: write.fields, seq, nowMs: Date.now() });
    tx.set(seqRef, { [pk]: seq }, { merge: true });
    tx.create(db.collection(JournalChangeCollection).doc(record.id), { ...record, tenants: ctx.tenants, uploadedAt: FieldValue.serverTimestamp() });
  });
}

async function requirePublished(db: Firestore, jk: string, footprintKey: string): Promise<void> {
  const fp = (await sub(db, jk, JournalFootprintCollection).doc(footprintKey).get()).data();
  if (!fp || fp['isArchived'] === true || fp['publishState'] !== 'published') throw new HttpsError('failed-precondition', 'footprint');
}

/** Everything a guest sees: published footprints with their CMS sections, photo and clip URLs (signed, 6 h), likes, comments. */
async function guestView(db: Firestore, jk: string, ctx: GuestContext): Promise<Data> {
  const [footprints, sectionSnaps, images, comments, reactions, person] = await Promise.all([
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
  const sectionDocs = sectionSnaps.docs.map((d) => ({ id: d.id, data: d.data() }));
  // per section and image (1.154 phase 4): from the materialised docs only; no person keys reach the guest
  const feedback = feedbackIndex(comments.docs.map((d) => ({ id: d.id, data: d.data() })), reactions.docs.map((d) => ({ id: d.id, data: d.data() })), pk, name);

  const unsorted = await Promise.all(live(footprints.docs).map(async (f) => {
    const fp = f.data();
    const parentKey = `page.${f.id}`;
    const order = Array.isArray(fp['sections']) ? (fp['sections'] as string[]) : [];
    const signing = guestSectionsOf(sectionDocs, f.id, order).map(async (section) => {
      const photos = section.imageKeys.map((key) => ({ key, image: imageById.get(key) })).filter((x) => x.image && x.image['path2048'])
        .map(({ key, image }) => ({
          key, width: image?.['width'], height: image?.['height'], latitude: image?.['latitude'], longitude: image?.['longitude'], takenAt: image?.['takenAt'],
          url: signImgixUrl(IMGIX_PRIVATE_HOST, token, String(image?.['path2048']), { w: 1600, auto: 'format', expires }),
          thumb: signImgixUrl(IMGIX_PRIVATE_HOST, token, String(image?.['path400']), { w: 400, auto: 'format', expires }),
        }));
      const clips = guestVideoClips(section.clipKeys, imageById, ctx.tenants[0] ?? '', jk);
      const signed = await Promise.all(clips.map(async (clip) => {
        try {
          const url = await clipReadUrl(privateBucket().file(clip.objectPath), expires * 1000);
          return {
            key: clip.key, width: clip.width, height: clip.height, durationSec: clip.durationSec,
            poster: clip.posterPath ? signImgixUrl(IMGIX_PRIVATE_HOST, token, clip.posterPath, { w: 1600, auto: 'format', expires }) : '',
            url,
          };
        } catch (error) {
          logger.warn('journalGuest: clip not signed', { journalKey: jk, imageKey: clip.key, error: error instanceof Error ? error.message : 'unknown' });
          return undefined;
        }
      }));
      const videos = signed.filter((v) => v !== undefined);
      // GuestSectionView: no author key, no other person data — only the author's display name from the journal lists
      return {
        key: section.key, type: section.type, title: section.title, html: section.html, properties: section.properties,
        authorName: name(section.authorKey), photos, videos, ...guestSectionFeedback(section, feedback),
      };
    });
    const sections = await Promise.all(signing);
    const likes = live(reactions.docs).filter((r) => r.data()['parentKey'] === parentKey).map((r) => String(r.data()['personKey']));
    const footprintComments = live(comments.docs).filter((c) => c.data()['parentKey'] === parentKey)
      .map((c) => ({
        key: c.id, authorName: name(String(c.data()['authorKey'] ?? '')) || String(c.data()['authorName'] ?? ''),
        text: String(c.data()['description'] ?? ''), createdAt: String(c.data()['creationDateTime'] ?? ''), mine: c.data()['authorKey'] === pk,
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return {
      key: f.id, title: fp['title'] ?? '', placeName: fp['placeName'] ?? '', date: fp['date'] ?? '', time: fp['time'] ?? '',
      latitude: fp['latitude'], longitude: fp['longitude'], weather: fp['weather'], transport: fp['transport'], sections, likes: likes.length, liked: likes.includes(pk), comments: footprintComments,
      // backward compatibility for this release: a guest page cached from before 1.154 reads `fp.blocks.flatMap(…)`
      blocks: [],
    };
  }));
  const result = unsorted.sort((a, b) => (`${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1));

  const delivery = (person.data()?.['newsDelivery'] as unknown[] | undefined) ?? undefined;
  // a stored 'signal' from before the Signal channel was retired counts as email
  const channel = Array.isArray(delivery) ? (delivery.includes('email') || delivery.includes('signal') ? 'email' : 'none') : 'email';
  return {
    // startDate: the guest's «Tag N» counts from the same first day as the authors' (travelStartDate)
    journal: { key: jk, title: ctx.journal['title'] ?? '', subTitle: ctx.journal['subTitle'] ?? '', startDate: ctx.journal['startDate'] ?? '' },
    me: { personKey: pk, name: ctx.name, channel, muted: !!ctx.link.mutedAt, expiresAt: ctx.link.expiresAt ?? '' },
    footprints: result,
  };
}

/**
 * Everything a guest does (spec 1.113 §7, plans 7, 8): no account, the link code is the credential. Actions:
 * view, comment (on a section or image; without `parentKey` an old footprint comment), deleteComment (own only), react and
 * unreact (an emoji on a section or image), like and unlike (old footprint likes, decision 10), settings (delivery channel),
 * mute, unmute. A comment or reaction is refused unless its parent is in a published footprint of this journal with its
 * switch on (decision 5). App Check enforced.
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
      case 'comment': {
        if (req.parentKey) {
          const footprintKey = await requireFeedbackTarget(db, req.journalKey, req.parentKey, 'comment');
          await appendGuestRecord(db, req.journalKey, ctx, 'comment', randomUUID(), 'create',
            { parentKey: req.parentKey, footprintKey, text: req.text, authorName: ctx.name, createdAt: new Date().toISOString() });
          return { ok: true };
        }
        // an old footprint comment (decision 10: one more release for cached clients)
        await requirePublished(db, req.journalKey, req.footprintKey as string);
        await appendGuestRecord(db, req.journalKey, ctx, 'comment', randomUUID(), 'create',
          { footprintKey: req.footprintKey, text: req.text, authorName: ctx.name, createdAt: new Date().toISOString() });
        return { ok: true };
      }
      case 'react':
      case 'unreact': {
        const footprintKey = await requireFeedbackTarget(db, req.journalKey, req.parentKey as string, 'reaction');
        await appendGuestReaction(db, req.journalKey, ctx, req.parentKey as string, footprintKey, req.emoji as string, req.action === 'react');
        return { ok: true };
      }
      case 'deleteComment': {
        // only the guest's own comment: its materialised document names the author
        const comment = (await sub(db, req.journalKey, JournalCommentCollection).doc(req.commentKey as string).get()).data();
        if (!mayDeleteComment(comment, pk)) throw new HttpsError('permission-denied', 'comment');
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
 * The email of each author and guest for the journal's authors (spec 1.154 §9, journal-author tier): the
 * tenant's favorite email (`emailFor`), '' when there is none. Membership comes from server-written data only
 * (`authorKeys`, the guest links) — never from the `authors`/`guests` arrays that change records materialise. Authors only — `manageJournalGuest` is
 * behind `requireJournalAuthor`, and nothing here ever reaches a guest.
 */
async function journalPeople(db: Firestore, journalKey: string, tenantId: string): Promise<{ personKey: string; email: string }[]> {
  const [journal, links] = await Promise.all([
    db.collection(JournalCollection).doc(journalKey).get(), privateDoc(db, journalKey, JournalGuestLinksDoc).get(),
  ]);
  const deps = createFirestoreDeps();
  return Promise.all(peopleKeys(journal.data()?.['authorKeys'], linksOf(links.data()))
    .map(async (personKey) => ({ personKey, email: await deps.emailFor(personKey, tenantId) })));
}

/**
 * Stores an author-entered email for a person of the tenant (spec 1.154 §9) — only when the person has no
 * email in this tenant yet; an existing address is never changed. One transaction, so a double tap cannot
 * add two favorites. Shape per the address model: flat `addresses`, `parentKey` `person.<okey>`, channel
 * email, favorite unless a live favorite email already exists, `tenants: [tenantId]` (provenance).
 * The answer is the same whether something was stored or not: it never tells whether an address exists.
 */
async function storeEmailIfMissing(db: Firestore, tenantId: string, personKey: string, email: string): Promise<void> {
  const parentKey = `person.${personKey}`;
  const stored = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(AddressCollection).where('parentKey', '==', parentKey));
    const emails = snap.docs.map((d) => d.data())
      .filter((a) => a['isArchived'] !== true && a['addressChannel'] === 'email' && Array.isArray(a['tenants']) && (a['tenants'] as string[]).includes(tenantId));
    if (emails.some((a) => typeof a['email'] === 'string' && a['email'] !== '')) return false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { okey, ...address } = { ...new AddressModel(tenantId) };
    tx.create(db.collection(AddressCollection).doc(), {
      ...address, addressChannel: 'email', email, parentKey, tenants: [tenantId],
      isFavorite: !emails.some((a) => a['isFavorite'] === true), isArchived: false,
      index: `n:${email} p:${parentKey} o:`,
    });
    return true;
  });
  // no address in the log (PII)
  logger.info(`manageJournalGuest: email for ${personKey}: ${stored ? 'stored' : 'kept existing'}`);
}

/**
 * Guests of a journal for its authors (plans 7, 8): links — list, create (or reuse a live one), expiry, revoke;
 * notices — `previewNotice` (what changed since the last notice, the proposed text, who would receive it) and
 * `sendNotice` (the author's possibly changed text to every live, unmuted guest); people (spec 1.154 §9) —
 * `people` (the email of every author and guest) and `hasEmail` (only whether a tenant person has one);
 * `create` takes an optional `email`, stored for a person who has none. The link
 * codes live in `journals/{jk}/private/guestLinks`, which no client can read.
 */
export const manageJournalGuest = onCall(
  { ...SMALL, timeoutSeconds: 300, enforceAppCheck: true, cors: true },
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
    if (action === 'people') return { people: await journalPeople(db, caller.journalKey, caller.tenantId) };
    if (action === 'hasEmail') {
      // only whether one exists — the address itself never leaves (R6): for a person about to become a guest
      const personKey = d['personKey'];
      if (!isJournalKey(personKey)) throw new HttpsError('invalid-argument', 'personKey');
      if (!(await personInTenant(db, personKey, [caller.tenantId]))) throw new HttpsError('failed-precondition', 'person not in tenant');
      return { hasEmail: (await createFirestoreDeps().emailFor(personKey, caller.tenantId)) !== '' };
    }
    if (action !== 'create' && action !== 'expiry' && action !== 'revoke') throw new HttpsError('invalid-argument', 'action');
    const personKey = d['personKey'];
    if (!isJournalKey(personKey)) throw new HttpsError('invalid-argument', 'personKey');
    // a guest is a person of the journal's tenant — never a link to another tenant's person
    // an optional email for a guest who has none yet (spec 1.154 §9): checked before anything is read or written
    const email = action === 'create' && d['email'] !== undefined ? parseGuestEmail({ personKey, email: d['email'] }).email : undefined;
    if (action === 'create' && !(await personInTenant(db, personKey, [caller.tenantId]))) throw new HttpsError('failed-precondition', 'person not in tenant');
    if (email) await storeEmailIfMissing(db, caller.tenantId, personKey, email);
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
