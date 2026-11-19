import { logger } from 'firebase-functions/v2';
import { getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  AddressCollection,
  AddressModel,
  AppConfigCollection,
  AvatarCollection,
  FeatureRolloutCollection,
  OrgCollection,
  PersonCollection,
  PersonPrivacyPreferences,
  PrivacySettings,
  WorkrelCollection,
} from '@okr/shared-models';
import { zurichStoreDate } from '@okr/shared-util-core';
import { projectAddressesForViewer, reduceToFavoriteAddresses } from '@okr/shared-util-functions';
import { effectiveFeatures, FEATURE_BLOCKS, type FeatureRollout } from '@okr/tenant-util';
import {
  bookCtag, buildLookupVCard, cardEtag, DEFAULT_REBUILD_INTERVAL, LOOKUP_SCOPE, RebuildInterval, VcardRecord, VcardTargetKind,
} from '@okr/vcard-util';

import { avatarDocIds, FsData, toVcardRecord } from '../vcard/record';
import { CONTACTS_DAV_BLOCK } from './dav-auth';
import type { BookCard, BookRoot } from './dav-handler';

/**
 * The CardDAV book as a Firestore snapshot (spec 1.159 §5.3–§5.4). Assembling 4143 contacts
 * reads ~14 000 documents, so it happens once per rebuild — weekly by default, on demand from
 * the modal — and a device's poll reads only the root doc.
 *
 *   contactsDavBooks/{tenantId}              BookRoot (index uid → ETag, ctag, builtAt, rebuildInterval)
 *   contactsDavBooks/{tenantId}/cards/{uid}  BookCard without uid (vcardText has no PHOTO)
 */

export const CONTACTS_DAV_BOOKS = 'contactsDavBooks';
export const BOOK_CARDS = 'cards';

const DAY_MS = 24 * 3600_000;
/** due thresholds; daily is 20 h so a nightly slot running a few minutes early still counts */
const DUE_MS: Record<Exclude<RebuildInterval, 'manual'>, number> = { weekly: 7 * DAY_MS, daily: 20 * 3600_000 };
const WRITE_BATCH = 400;
const GETALL_BATCH = 300;

/**
 * Is the book due? `cardsMissing` (a card doc gone while the index still lists it — what an
 * erasure leaves behind) makes it due whatever the interval, so the erased contact also leaves
 * the devices within a night (final review, Important 4).
 */
export function isRebuildDue(builtAt: string | undefined, interval: RebuildInterval | undefined, now: Date, cardsMissing = false): boolean {
  if (cardsMissing) return true;
  const effective = interval ?? DEFAULT_REBUILD_INTERVAL;
  if (effective === 'manual') return false;
  if (!builtAt) return true;
  const built = Date.parse(builtAt);
  return Number.isNaN(built) || now.getTime() - built >= DUE_MS[effective];
}

/** Which cards to write and which to delete, given the previous index. */
export function planBookWrites(oldIndex: Record<string, string>, cards: BookCard[]): { upserts: BookCard[]; deletes: string[] } {
  const keep = new Set(cards.map((c) => c.uid));
  return {
    upserts: cards.filter((c) => oldIndex[c.uid] !== c.etag),
    deletes: Object.keys(oldIndex).filter((uid) => !keep.has(uid)),
  };
}

/** A contact belongs in the book only with something to look up (§5.4). */
export function hasLookupChannel(record: VcardRecord): boolean {
  return record.channels.some((c) => (c.channel === 'phone' || c.channel === 'email') && !!c.value);
}

/**
 * One address per channel — the favourite, else the first non-CC one (the members' directory
 * rule, `reduceToFavoriteAddresses`) — for persons AND orgs (owner, 2026-11-17: «just the
 * favourite addresses»). The favourite bank account has no vCard field and becomes the note.
 */
export function lookupAddresses(addresses: FsData[], today = zurichStoreDate()): { addresses: FsData[]; note?: string } {
  const picked = reduceToFavoriteAddresses(addresses as unknown as AddressModel[], today) as unknown as FsData[];
  const bank = picked.find((a) => a['addressChannel'] === 'bankaccount' && a['iban']);
  const label = bank ? String(bank['addressChannelLabel'] || bank['addressUsageLabel'] || '').trim() : '';
  return {
    addresses: picked.filter((a) => a['addressChannel'] !== 'bankaccount'),
    ...(bank ? { note: `IBAN${label ? ` ${label}` : ''}: ${String(bank['iban'])}` } : {}),
  };
}

export async function renderBookCard(record: VcardRecord, avatarPath: string, avatarVersion: string): Promise<BookCard> {
  const vcardText = buildLookupVCard(record);
  return { uid: record.uid ?? '', vcardText, etag: await cardEtag(vcardText, avatarPath, avatarVersion), avatarPath, avatarVersion };
}

const active = (d: FsData): boolean => d['isArchived'] !== true;

function groupBy(docs: FsData[], key: string): Map<string, FsData[]> {
  const m = new Map<string, FsData[]>();
  for (const d of docs) {
    const k = d[key] as string | undefined;
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(d);
    else m.set(k, [d]);
  }
  return m;
}

/**
 * Every card of the tenant's book, in bulk: one query per collection, addresses and workrels
 * grouped in memory, avatar docs by `getAll`. The privacy projection runs at the `privileged`
 * tier, as `vcardExport` does for an admin (D-6).
 */
export async function loadBookCards(db: Firestore, tenantId: string): Promise<BookCard[]> {
  const tenantQuery = (collection: string) => db.collection(collection).where('tenants', 'array-contains', tenantId).get();
  const [personSnap, orgSnap, addressSnap, workrelSnap, configSnap] = await Promise.all([
    tenantQuery(PersonCollection),
    tenantQuery(OrgCollection),
    tenantQuery(AddressCollection),
    tenantQuery(WorkrelCollection),
    db.collection(AppConfigCollection).doc(tenantId).get(),
  ]);
  const settings = configSnap.exists ? (configSnap.data() as Partial<PrivacySettings>) : undefined;
  const addressesByParent = groupBy(addressSnap.docs.map((d) => d.data()).filter(active), 'parentKey');
  const workrelsBySubject = groupBy(workrelSnap.docs.map((d) => d.data()).filter(active), 'subjectKey');

  const subjects: { kind: VcardTargetKind; key: string; data: FsData }[] = [
    ...personSnap.docs.filter((d) => active(d.data())).map((d) => ({ kind: 'person' as const, key: d.id, data: d.data() })),
    ...orgSnap.docs.filter((d) => active(d.data())).map((d) => ({ kind: 'org' as const, key: d.id, data: d.data() })),
  ];

  const records: VcardRecord[] = [];
  const today = zurichStoreDate();
  for (const { kind, key, data } of subjects) {
    const raw = addressesByParent.get(`${kind}.${key}`) ?? [];
    const projected = projectAddressesForViewer(
      raw as unknown as AddressModel[], 'privileged', kind,
      kind === 'person' ? (data as Partial<PersonPrivacyPreferences>) : undefined,
      settings,
      today,
    ) as unknown as FsData[];
    const { addresses, note } = lookupAddresses(projected, today);
    try {
      const record = toVcardRecord({
        kind, key, data, addresses,
        workrels: kind === 'person' ? workrelsBySubject.get(key) ?? [] : [],
        scope: LOOKUP_SCOPE, favoritesOnly: false, today,
      });
      if (note) record.note = note;
      if (hasLookupChannel(record)) records.push(record);
    } catch (e) {
      // one malformed record must not stop the book; it is left out and named by key only
      logger.warn('contactsDavRebuild: record skipped', { tenantId, uid: `${kind}-${key}`, error: (e as Error).message });
    }
  }

  // both candidate avatar docs per record (the tenant's own picture wins), read by getAll in batches
  const keyOf = (r: VcardRecord) => r.uid!.slice(r.kind.length + 1);
  const avatarRefs: DocumentReference[] = records.flatMap((r) => avatarDocIds(tenantId, r.kind, keyOf(r)).map((id) => db.collection(AvatarCollection).doc(id)));
  const avatars = new Map<string, { path: string; version: string }>();
  for (let i = 0; i < avatarRefs.length; i += GETALL_BATCH) {
    const snaps = await db.getAll(...avatarRefs.slice(i, i + GETALL_BATCH));
    for (const s of snaps) {
      const path = s.exists ? (s.get('storagePath') as string | undefined) : undefined;
      if (path) avatars.set(s.id, { path, version: s.updateTime?.toDate().toISOString() ?? '' });
    }
  }

  const cards = await Promise.all(records.map(async (r) => {
    const avatar = avatarDocIds(tenantId, r.kind, keyOf(r)).map((id) => avatars.get(id)).find((a) => !!a);
    try {
      return await renderBookCard(r, avatar?.path ?? '', avatar?.version ?? '');
    } catch (e) {
      logger.warn('contactsDavRebuild: card skipped', { tenantId, uid: r.uid, error: (e as Error).message });
      return undefined;
    }
  }));
  return cards.filter((c): c is BookCard => !!c);
}

/**
 * Rebuild one tenant's book: write only changed cards, delete departed ones, then the root
 * last — a client never sees an ETag whose card is not written yet (§5.3).
 */
export async function rebuildContactsDavBook(db: Firestore, tenantId: string, now = new Date()): Promise<{ cardCount: number; written: number; deleted: number }> {
  const rootRef = db.collection(CONTACTS_DAV_BOOKS).doc(tenantId);
  const rootSnap = await rootRef.get();
  const old = rootSnap.exists ? (rootSnap.data() as BookRoot) : undefined;
  const cards = await loadBookCards(db, tenantId);
  const { upserts, deletes } = planBookWrites(old?.index ?? {}, cards);

  const cardsRef = rootRef.collection(BOOK_CARDS);
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [
    ...upserts.map((c) => (b: FirebaseFirestore.WriteBatch) => {
      const { uid, ...doc } = c;
      b.set(cardsRef.doc(uid), doc);
    }),
    ...deletes.map((uid) => (b: FirebaseFirestore.WriteBatch) => b.delete(cardsRef.doc(uid))),
  ];
  for (let i = 0; i < ops.length; i += WRITE_BATCH) {
    const batch = db.batch();
    ops.slice(i, i + WRITE_BATCH).forEach((op) => op(batch));
    await batch.commit();
  }

  const index = Object.fromEntries(cards.map((c) => [c.uid, c.etag]));
  const root: BookRoot = {
    ctag: await bookCtag(index),
    cardCount: cards.length,
    builtAt: now.toISOString(),
    rebuildInterval: old?.rebuildInterval ?? DEFAULT_REBUILD_INTERVAL,
    index,
  };
  await rootRef.set(root);
  return { cardCount: cards.length, written: upserts.length, deleted: deletes.length };
}

/** Nightly job: rebuild every book that is due, for tenants with the `contactsDav` block. */
export async function runContactsDavRebuild(): Promise<void> {
  const db = getFirestore();
  const [configs, rolloutSnap] = await Promise.all([db.collection(AppConfigCollection).get(), db.collection(FeatureRolloutCollection).get()]);
  const rollouts = rolloutSnap.docs.map((d) => ({ okey: d.id, ...d.data() }) as FeatureRollout);
  const now = new Date();
  for (const cfg of configs.docs) {
    const tenantId = cfg.id;
    const enabled = effectiveFeatures({ catalogue: FEATURE_BLOCKS, rollouts, tenantId, enabled: cfg.get('enabledFeatures') as string[] | undefined });
    if (!enabled.has(CONTACTS_DAV_BLOCK)) continue;
    const rootRef = db.collection(CONTACTS_DAV_BOOKS).doc(tenantId);
    const root = (await rootRef.get()).data() as BookRoot | undefined;
    // one aggregate read: fewer card docs than index entries = a card was erased (§8)
    const stored = root?.index ? (await rootRef.collection(BOOK_CARDS).count().get()).data().count : 0;
    const cardsMissing = !!root?.index && stored < Object.keys(root.index).length;
    if (!isRebuildDue(root?.builtAt, root?.rebuildInterval, now, cardsMissing)) continue;
    try {
      const r = await rebuildContactsDavBook(db, tenantId, now);
      logger.info('contactsDavRebuild: rebuilt', { tenantId, ...r });
    } catch (e) {
      logger.error('contactsDavRebuild: failed', { tenantId, error: (e as Error).message });
    }
  }
}
