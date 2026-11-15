import { createHash, randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { AppConfigCollection, FeatureRolloutCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { effectiveFeatures, FEATURE_BLOCKS, type FeatureRollout } from '@okr/tenant-util';

/**
 * The app password of the CardDAV mirror (spec 1.159 §7). The token is a password: only its
 * sha256 is stored, as the doc id of `carddavTokens`. Every request is re-checked against the
 * user, the tenant, the `admin` role and the feature block — a revoked role or a switched-off
 * block ends access at the next poll.
 */

export const CARDDAV_TOKENS = 'carddavTokens';
export const CONTACTS_DAV_BLOCK = 'contactsDav';

export interface CarddavTokenDoc {
  uid: string;
  tenantId: string;
  /** StoreDate */
  createdAt: string;
  /** StoreDate, written at most once a day */
  lastUsedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

/** 32 characters Base62 from 32 random bytes — the same recipe as the calendar feed token. */
export function mintToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(32), (b) => alphabet[b % alphabet.length]).join('');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** `Authorization: Basic …` → user and password; undefined for anything else or an empty password. */
export function parseBasicAuth(header: string | undefined): { user: string; password: string } | undefined {
  if (!header || !/^Basic\s+/i.test(header)) return undefined;
  const decoded = Buffer.from(header.replace(/^Basic\s+/i, '').trim(), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return undefined;
  const password = decoded.slice(colon + 1);
  return password ? { user: decoded.slice(0, colon), password } : undefined;
}

/** May this token open its tenant's book right now? (§7.3) */
export function carddavVerdict(token: CarddavTokenDoc | undefined, user: FsData | undefined, features: Set<string>): boolean {
  if (!token || !user) return false;
  if (user['isArchived'] === true) return false;
  const tenants = Array.isArray(user['tenants']) ? (user['tenants'] as string[]) : [];
  if (!tenants.includes(token.tenantId)) return false;
  if (user['roles']?.['admin'] !== true) return false;
  return features.has(CONTACTS_DAV_BLOCK);
}

/** The tenant's effective feature blocks (catalogue ∩ rollout ∩ enablement). */
export async function tenantFeatures(db: Firestore, tenantId: string): Promise<Set<string>> {
  const [configSnap, rolloutSnap] = await Promise.all([
    db.collection(AppConfigCollection).doc(tenantId).get(),
    db.collection(FeatureRolloutCollection).get(),
  ]);
  if (!configSnap.exists) return new Set();
  return effectiveFeatures({
    catalogue: FEATURE_BLOCKS,
    rollouts: rolloutSnap.docs.map((d) => ({ okey: d.id, ...d.data() }) as FeatureRollout),
    tenantId,
    enabled: configSnap.get('enabledFeatures') as string[] | undefined,
  });
}

/** How long a positive or negative verdict is reused by this instance (§13: discovery is chatty). */
const VERDICT_TTL_MS = 60_000;
const verdicts = new Map<string, { at: number; token: (CarddavTokenDoc & { hash: string }) | undefined }>();

/**
 * Check one request's Basic credentials. Returns the token (with its hash) when access is
 * granted, else undefined. Verdicts are cached per hash for a minute, so Apple's repeated
 * discovery requests cost one set of reads.
 */
export async function checkCarddavRequest(db: Firestore, authHeader: string | undefined, now = Date.now()): Promise<(CarddavTokenDoc & { hash: string }) | undefined> {
  const creds = parseBasicAuth(authHeader);
  if (!creds) return undefined;
  const hash = hashToken(creds.password);
  const cached = verdicts.get(hash);
  if (cached && now - cached.at < VERDICT_TTL_MS) return cached.token;

  const tokenSnap = await db.collection(CARDDAV_TOKENS).doc(hash).get();
  const token = tokenSnap.exists ? (tokenSnap.data() as CarddavTokenDoc) : undefined;
  let granted: (CarddavTokenDoc & { hash: string }) | undefined;
  if (token) {
    const [userSnap, features] = await Promise.all([
      db.collection('users').doc(token.uid).get(),
      tenantFeatures(db, token.tenantId),
    ]);
    if (carddavVerdict(token, userSnap.data(), features)) granted = { ...token, hash };
  }
  verdicts.set(hash, { at: now, token: granted });

  const today = getTodayStr(DateFormat.StoreDate);
  if (granted && granted.lastUsedAt !== today) {
    await db.collection(CARDDAV_TOKENS).doc(hash).update({ lastUsedAt: today }).catch(() => undefined);
  }
  return granted;
}

/** Drop the cached verdict of a hash — after a revoke or a new password, access changes at once. */
export function forgetVerdict(hash: string): void {
  verdicts.delete(hash);
}
