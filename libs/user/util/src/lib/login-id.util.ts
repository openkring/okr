/**
 * The Benutzername (loginId) — spec 2026-09-30-login-id-spec.md §3.
 *
 * Pure on purpose: the app (login form, profile, AOC) and the Cloud Functions (the single writer)
 * must agree byte for byte on what a Benutzername looks like and how a synthetic Auth email is
 * built, and a second implementation on either side is exactly how they would drift.
 */
export const LOGIN_ID_MIN = 3;
export const LOGIN_ID_MAX = 40;
export const LOGIN_ID_PATTERN = /^[a-z0-9_.-]{3,40}$/;

/** Room left for a numeric collision suffix (max_mueller2 … max_mueller99). */
const BASE_MAX = LOGIN_ID_MAX - 2;
const FALLBACK_BASE = 'mitglied';
const UMLAUTS: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

function foldNamePart(part: string): string {
  return (part ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s''`´]/g, '')
    .replace(/[^a-z0-9.-]/g, '');
}

/** `vorname_nachname`, folded (spec §3). Never shorter than 3 characters. */
export function proposeLoginIdBase(firstName: string, lastName: string): string {
  const base = [foldNamePart(firstName), foldNamePart(lastName)].filter(Boolean).join('_').slice(0, BASE_MAX);
  return base.length >= LOGIN_ID_MIN ? base : FALLBACK_BASE;
}

/** The base itself when free, else base2, base3, … — always within LOGIN_ID_MAX. */
export function nextFreeLoginId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = base.slice(0, LOGIN_ID_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

export function normalizeLoginIdInput(input: string): string {
  return (input ?? '').trim().toLowerCase();
}

export function isValidLoginId(id: string): boolean {
  return LOGIN_ID_PATTERN.test(id ?? '');
}

/** The login form's one field holds a Benutzername exactly when it has no `@` (spec §5.1). */
export function isLoginIdInput(input: string): boolean {
  const value = (input ?? '').trim();
  return value.length > 0 && !value.includes('@');
}

/** `app.seeclub.org` → `seeclub.org`. Deliberately NOT `emailDomain` (spec decision 3). */
export function loginDomainFromAppDomain(appDomain: string): string {
  return (appDomain ?? '').trim().toLowerCase().replace(/^app\./, '');
}

export function syntheticLoginEmail(loginId: string, appDomain: string): string {
  return `${loginId}@login.${loginDomainFromAppDomain(appDomain)}`;
}

/** A `…@login.<domain>` Auth email — never mailable (no MX), see spec decision 3. */
export function isSyntheticLoginEmail(email: string | undefined): boolean {
  return /@login\.[^@]+$/i.test((email ?? '').trim());
}

export function loginIdFromSyntheticEmail(email: string): string {
  return isSyntheticLoginEmail(email) ? email.trim().toLowerCase().split('@')[0] : '';
}
