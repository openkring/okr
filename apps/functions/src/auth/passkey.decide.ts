// apps/functions/src/auth/passkey.decide.ts
//
// The pure decisions of the passkey callable (spec 1.120). No Firebase here — see the spec file.
import type { PasskeyItem } from '@okr/shared-models';

import { escapeHtml } from '../calendar/mail';

export const CHALLENGE_TTL_MS = 300_000;
export const RECENT_SIGNIN_SECONDS = 300;

export type ChallengePurpose = 'register' | 'login';

export interface StoredChallenge {
  purpose: ChallengePurpose;
  challenge: string;
  rpId: string;
  origin: string;
  uid?: string;
  expiresAt: number;
}

/** The relying-party id the client asked for, if it is one we serve: the app domain or localhost. */
export function resolveRpId(requestedRpId: string, appDomain: string): string | undefined {
  if (requestedRpId === '') return undefined;
  if (requestedRpId === 'localhost') return requestedRpId;
  return appDomain !== '' && requestedRpId === appDomain ? requestedRpId : undefined;
}

/** The origin a WebAuthn response must carry. Derived from the rpId; only localhost takes the client's (http) origin. */
export function expectedOrigin(rpId: string, clientOrigin: string): string | undefined {
  if (rpId !== 'localhost') return `https://${rpId}`;
  try {
    const u = new URL(clientOrigin);
    return u.protocol === 'http:' && u.hostname === 'localhost' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * SHA-256 fingerprints of the certificates a tenant's Android app is signed with (spec 1.120 §7,
 * phase 2): the Play app signing key (every Play install) and the upload key (local release
 * builds). Public values — the same ones `/.well-known/assetlinks.json` publishes. Add a tenant
 * here when its Android app is released; see the `android-release` skill for where to read them.
 */
export const ANDROID_SIGNING_SHA256: Readonly<Record<string, readonly string[]>> = {
  scs: [
    '38:C8:57:66:E6:1F:8A:4C:AF:7C:F4:CA:17:12:65:1A:A4:1E:3C:94:E4:CD:56:8C:33:EF:B4:26:B0:02:35:25', // Play app signing
    'C8:6B:14:71:A4:4D:28:27:8A:2B:31:41:39:6A:20:F7:CB:9A:6C:2F:E4:2E:64:B8:37:5F:C3:53:4B:1E:80:A4', // upload key
  ],
};

/** `android:apk-key-hash:<base64url sha256>` — the origin Credential Manager reports for a native Android app. */
export function apkKeyHashOrigin(sha256Fingerprint: string): string {
  const hex = sha256Fingerprint.replace(/:/g, '');
  return `android:apk-key-hash:${Buffer.from(hex, 'hex').toString('base64url')}`;
}

/**
 * Every origin a WebAuthn response for this challenge may carry: the web origin it was issued for
 * plus, for a real app host, the tenant's native Android app. iOS needs no entry — AuthenticationServices
 * reports `https://<rpId>`, the web origin. Android signs with the app's certificate hash instead.
 */
export function verifyOrigins(origin: string, rpId: string, tenantId: string | undefined): string[] {
  if (rpId === 'localhost' || !tenantId) return [origin];
  return [origin, ...(ANDROID_SIGNING_SHA256[tenantId] ?? []).map(apkKeyHashOrigin)];
}

export function isChallengeUsable(c: StoredChallenge | undefined, purpose: ChallengePurpose, nowMs: number): boolean {
  return !!c && c.purpose === purpose && nowMs <= c.expiresAt;
}

/** @param authTimeSec the ID token's auth_time (seconds since epoch) */
export function isRecentSignIn(authTimeSec: number | undefined, nowMs: number): boolean {
  if (authTimeSec === undefined) return false;
  return nowMs - authTimeSec * 1000 <= RECENT_SIGNIN_SECONDS * 1000;
}

/**
 * Why this session may not add a passkey, or undefined when it may. An admin's impersonation
 * session (`createCustomToken` stamps `impersonatedBy`) is always fresh, so without this check
 * it could plant a passkey and keep a permanent login to the member's account.
 */
export function registrationBlock(
  token: { auth_time?: number; impersonatedBy?: unknown } | undefined,
  nowMs: number,
): 'impersonated' | 'recent-login-required' | undefined {
  if (token?.impersonatedBy) return 'impersonated';
  if (!isRecentSignIn(token?.auth_time, nowMs)) return 'recent-login-required';
  return undefined;
}

export function checkLoginTarget(t: {
  passkey?: { uid: string; rpId: string; tenants: string[] };
  userTenants?: string[];
  authDisabled?: boolean;
  tenantId: string;
  rpId: string;
}): 'ok' | 'reject' {
  if (!t.passkey || !t.userTenants || t.authDisabled === true) return 'reject';
  if (!t.passkey.tenants.includes(t.tenantId) || !t.userTenants.includes(t.tenantId)) return 'reject';
  return t.passkey.rpId === t.rpId ? 'ok' : 'reject';
}

/** Owner, or an admin who shares a tenant with the passkey. */
export function mayManagePasskey(
  caller: { uid: string; isAdmin: boolean; tenants: string[] },
  passkey: { uid: string; tenants: string[] },
): boolean {
  if (caller.uid === passkey.uid) return true;
  return caller.isAdmin && caller.tenants.some((t) => passkey.tenants.includes(t));
}

export function defaultPasskeyLabel(userAgent: string): string {
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Macintosh')) return 'Mac';
  if (userAgent.includes('Windows')) return 'Windows';
  return 'Gerät';
}

export function passkeyAddedMail(appName: string, label: string, when: string): { subject: string; html: string } {
  return {
    subject: `Neuer Passkey für dein Konto bei ${appName}`,
    html: [
      `<p>Für dein Konto bei ${escapeHtml(appName)} wurde ein neuer Passkey eingerichtet.</p>`,
      `<p>Gerät: ${escapeHtml(label)}<br>Zeitpunkt: ${escapeHtml(when)}</p>`,
      '<p>Mit dem Passkey kannst du dich künftig ohne Passwort anmelden.</p>',
      '<p>Warst du das nicht? Melde dich mit deinem Passwort an und lösche den Passkey in deinem Profil unter «Passkeys».</p>',
    ].join(''),
  };
}

/** Longest label a passkey may carry (rename). */
export const PASSKEY_LABEL_MAX = 40;

/**
 * A credential id as it may name a `passkeys` doc: non-empty base64url only. Anything else — in
 * particular a `/` — must never reach `collection().doc()`, where it would address another path.
 */
export function isCredentialId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 1024 && /^[A-Za-z0-9_-]+$/.test(id);
}

/** The trimmed label, or undefined when it is empty or longer than PASSKEY_LABEL_MAX. */
export function normalizePasskeyLabel(label: unknown): string | undefined {
  if (typeof label !== 'string') return undefined;
  const trimmed = label.trim();
  return trimmed.length >= 1 && trimmed.length <= PASSKEY_LABEL_MAX ? trimmed : undefined;
}

/** What the client may see of a stored passkey — never the public key, counter or uid. */
export function toPasskeyItem(okey: string, data: Record<string, unknown> | undefined): PasskeyItem {
  return {
    okey,
    label: String(data?.['label'] ?? ''),
    createdAt: String(data?.['createdAt'] ?? ''),
    lastUsedAt: String(data?.['lastUsedAt'] ?? ''),
    backedUp: data?.['backedUp'] === true,
  };
}

/** Newest first (StoreDateTime strings sort lexically). */
export function byCreatedAtDesc(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}
