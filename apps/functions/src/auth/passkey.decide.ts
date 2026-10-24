// apps/functions/src/auth/passkey.decide.ts
//
// The pure decisions of the passkey callable (spec 1.120). No Firebase here — see the spec file.
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

export function isChallengeUsable(c: StoredChallenge | undefined, purpose: ChallengePurpose, nowMs: number): boolean {
  return !!c && c.purpose === purpose && nowMs <= c.expiresAt;
}

/** @param authTimeSec the ID token's auth_time (seconds since epoch) */
export function isRecentSignIn(authTimeSec: number | undefined, nowMs: number): boolean {
  if (authTimeSec === undefined) return false;
  return nowMs - authTimeSec * 1000 <= RECENT_SIGNIN_SECONDS * 1000;
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
