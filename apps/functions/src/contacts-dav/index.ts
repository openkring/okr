import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import {
  ContactsDavAdminRequest, ContactsDavStatus, DEFAULT_REBUILD_INTERVAL, RebuildInterval,
} from '@okr/vcard-util';

import { fetchAvatarBase64ByPath } from '../vcard/record';
import { BOOK_CARDS, CONTACTS_DAV_BOOKS, rebuildContactsDavBook } from './book';
import {
  CARDDAV_TOKENS, CarddavTokenDoc, carddavVerdict, checkCarddavRequest, forgetVerdict, hashToken, mintToken, tenantFeatures,
} from './dav-auth';
import { BookCard, BookRoot, DavDeps, handleDav } from './dav-handler';

/**
 * The contacts mirror (spec 1.159 Part B): `contactsDav` answers CardDAV for Apple Contacts,
 * `contactsDavAdmin` serves the modal «Adressbuch auf Mac und iPhone».
 *
 * One callable with an `op` instead of several functions: europe-west6 is at its CPU quota and
 * every extra function is a deploy risk (plan 2026-11-15, Global Constraints).
 */

const REGION = 'europe-west6';

/**
 * The device URL: the Cloud Run URL of `contactsDav` (§5.1 — Firebase Hosting refuses WebDAV
 * methods). Cloud Run lower-cases the service name; `kkq6jzhptq-oa` is this project's hash in
 * europe-west6 (seen on `publicapi-…` and the S1 spike). Verify after each first deploy with
 * `gcloud functions describe contactsDav --gen2 --region=europe-west6`.
 */
export const CONTACTS_DAV_URL = 'https://contactsdav-kkq6jzhptq-oa.a.run.app/';

const PHOTO_TIMEOUT_MS = 8000;
const GETALL_BATCH = 300;
const REFRESH_MIN_GAP_MS = 5 * 60_000;
const INTERVALS: RebuildInterval[] = ['weekly', 'daily', 'manual'];

function davDeps(db: Firestore): DavDeps {
  return {
    async authorize(header) {
      const token = await checkCarddavRequest(db, tenantFeatures, header);
      return token ? { tenantId: token.tenantId } : undefined;
    },
    async readBook(tenantId) {
      const snap = await db.collection(CONTACTS_DAV_BOOKS).doc(tenantId).get();
      // a root holding only `rebuildInterval` (set before the first rebuild) is not a book yet
      return snap.exists && snap.get('index') ? (snap.data() as BookRoot) : undefined;
    },
    async readCards(tenantId, uids) {
      const col = db.collection(CONTACTS_DAV_BOOKS).doc(tenantId).collection(BOOK_CARDS);
      const out: BookCard[] = [];
      for (let i = 0; i < uids.length; i += GETALL_BATCH) {
        const snaps = await db.getAll(...uids.slice(i, i + GETALL_BATCH).map((u) => col.doc(u)));
        for (const s of snaps) if (s.exists) out.push({ uid: s.id, ...(s.data() as Omit<BookCard, 'uid'>) });
      }
      return out;
    },
    fetchPhoto: (path) => fetchAvatarBase64ByPath(path, AbortSignal.timeout(PHOTO_TIMEOUT_MS)),
    log: (message, data) => logger.info(message, data),
  };
}

/** Read-only CardDAV endpoint; Basic auth with the app password (§7.3). */
export const contactsDav = onRequest(
  { region: REGION, memory: '512MiB', timeoutSeconds: 120 },
  async (req, res) => {
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      const r = await handleDav({ method: req.method, path: req.path, headers, body: rawBody ? rawBody.toString('utf8') : '' }, davDeps(getFirestore()));
      for (const [k, v] of Object.entries(r.headers)) res.set(k, v);
      res.status(r.status).send(r.body);
    } catch (e) {
      logger.error('contactsDav: failed', { method: req.method, path: req.path, error: (e as Error).message });
      res.status(500).send('error');
    }
  },
);

interface UserData {
  tenants?: string[];
  roles?: Record<string, boolean>;
  isArchived?: boolean;
  loginEmail?: string;
}

/** Status, password and refresh for the modal (§7.2, §7.4). Admin of the tenant, block enabled. */
export const contactsDavAdmin = onCall<ContactsDavAdminRequest>(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 300, memory: '512MiB' },
  async (request): Promise<ContactsDavStatus> => {
    const CF = 'contactsDavAdmin';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkAppCheckToken(request as any, CF);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkAuthentication(request as any, CF);
    const uid = request.auth!.uid;
    const { tenantId, op, interval } = request.data ?? ({} as ContactsDavAdminRequest);
    if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is required');
    if (!['status', 'mint', 'revoke', 'refresh', 'setInterval'].includes(op)) throw new HttpsError('invalid-argument', 'invalid op');

    const db = getFirestore();
    const [userSnap, features] = await Promise.all([db.collection('users').doc(uid).get(), tenantFeatures(db, tenantId)]);
    const user = userSnap.data() as UserData | undefined;
    // the same rule the endpoint applies to every request, with a synthetic token for this caller
    const probe: CarddavTokenDoc = { uid, tenantId, createdAt: '', lastUsedAt: '' };
    if (!carddavVerdict(probe, user, features)) {
      logger.warn(`${CF}: refused`, { uid, tenantId, op });
      throw new HttpsError('permission-denied', 'not allowed');
    }

    const tokens = db.collection(CARDDAV_TOKENS);
    const rootRef = db.collection(CONTACTS_DAV_BOOKS).doc(tenantId);
    const mine = async () => (await tokens.where('uid', '==', uid).get()).docs.filter((d) => d.get('tenantId') === tenantId);
    let plainToken: string | undefined;

    switch (op) {
      case 'mint': {
        plainToken = await db.runTransaction(async (tx) => {
          const existing = (await tx.get(tokens.where('uid', '==', uid))).docs.filter((d) => d.get('tenantId') === tenantId);
          for (const d of existing) {
            tx.delete(d.ref);
            forgetVerdict(d.id);
          }
          const fresh = mintToken();
          const today = getTodayStr(DateFormat.StoreDate);
          const doc: CarddavTokenDoc = { uid, tenantId, createdAt: today, lastUsedAt: '' };
          tx.set(tokens.doc(hashToken(fresh)), doc);
          return fresh;
        });
        logger.info(`${CF}: minted`, { uid, tenantId, hashPrefix: hashToken(plainToken).slice(0, 6) });
        break;
      }
      case 'revoke': {
        const existing = await mine();
        const batch = db.batch();
        for (const d of existing) {
          batch.delete(d.ref);
          forgetVerdict(d.id);
        }
        await batch.commit();
        logger.info(`${CF}: revoked`, { uid, tenantId, count: existing.length });
        break;
      }
      case 'refresh': {
        const builtAt = (await rootRef.get()).get('builtAt') as string | undefined;
        if (builtAt && Date.now() - Date.parse(builtAt) < REFRESH_MIN_GAP_MS) {
          throw new HttpsError('resource-exhausted', 'the address book was refreshed less than 5 minutes ago');
        }
        const r = await rebuildContactsDavBook(db, tenantId);
        logger.info(`${CF}: rebuilt`, { uid, tenantId, ...r });
        break;
      }
      case 'setInterval': {
        if (!interval || !INTERVALS.includes(interval)) throw new HttpsError('invalid-argument', 'invalid interval');
        await rootRef.set({ rebuildInterval: interval }, { merge: true });
        break;
      }
    }

    const [existing, rootSnap] = await Promise.all([mine(), rootRef.get()]);
    const root = rootSnap.data() as Partial<BookRoot> | undefined;
    const lastUsed = existing.map((d) => d.get('lastUsedAt') as string).filter(Boolean).sort().pop();
    return {
      serverUrl: CONTACTS_DAV_URL,
      username: user?.loginEmail ?? '',
      hasToken: existing.length > 0,
      ...(plainToken ? { token: plainToken } : {}),
      ...(lastUsed ? { lastUsedAt: lastUsed } : {}),
      ...(root?.builtAt ? { builtAt: root.builtAt, cardCount: root.cardCount ?? 0 } : {}),
      rebuildInterval: root?.rebuildInterval ?? DEFAULT_REBUILD_INTERVAL,
    };
  },
);
