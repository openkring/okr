// apps/functions/src/auth/passkey.ts
//
// Passkey (WebAuthn) registration, login and management — one router callable (spec 1.120 §5).
// Login has the shape of loginWithLoginId: the function checks the proof and answers with a custom
// token the client exchanges via signInWithCustomToken. `passkeys` and `webauthn-challenges` are
// server-only collections (rules deny every client access), so this file is their only reader/writer.
//
// Security contract (spec §11):
// - every challenge is single use: it is read AND deleted in one transaction before anything is
//   checked, so even an invalid attempt burns it;
// - origin and rpId at verify time come from the stored challenge (set by the options op from the
//   tenant's app-config), never from the verify request;
// - every loginVerify failure answers the same `unauthenticated` error no earlier than 900 ms after
//   the request started, whatever check failed.

import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';

import { PasskeyCollection, UserCollection, WebauthnChallengeCollection } from '@okr/shared-models';
import type { PasskeyItem, PasskeyModel } from '@okr/shared-models';
import { checkAppCheckToken, getCallerContext } from '@okr/shared-util-functions';
import { isSyntheticLoginEmail } from '@okr/user-util';
import { toStoreDateTime } from '../srv/zurich-time';

import { getAppEmailConfig } from './email-templates';
import { DEFAULT_EMAIL_PROVIDER, isValidProvider, sendEmailViaProvider } from './email-transport';
import { tenantAppDomain } from './login-id';
import {
  byCreatedAtDesc, ChallengePurpose, CHALLENGE_TTL_MS, checkLoginTarget, defaultPasskeyLabel, expectedOrigin,
  isChallengeUsable, isCredentialId, isRecentSignIn, mayManagePasskey, normalizePasskeyLabel, passkeyAddedMail,
  PASSKEY_LABEL_MAX, resolveRpId, StoredChallenge, toPasskeyItem,
} from './passkey.decide';

const CF_NAME = 'passkey';
const REGION = 'europe-west6';
/** Every loginVerify failure answers no earlier than this (same floor as loginWithLoginId). */
const FAILURE_FLOOR_MS = 900;
/** The mail transport reads these (D6 "new passkey" notice). */
const MAIL_SECRETS = ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'];

/** A stored challenge is also bound to the tenant that asked for it. */
type ChallengeDoc = StoredChallenge & { tenantId: string };

type PasskeyDoc = Omit<PasskeyModel, 'okey'>;

interface PasskeyRequest {
  op?: string;
  tenantId?: unknown;
  rpId?: unknown;
  origin?: unknown;
  challengeId?: unknown;
  response?: unknown;
  uid?: unknown;
  okey?: unknown;
  label?: unknown;
}

const db = () => getFirestore();
const passkeys = () => db().collection(PasskeyCollection);
const challenges = () => db().collection(WebauthnChallengeCollection);

/** `error.code` when present, else the message — never the raw object (could carry PII). */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Enough of a credential id to find it in the logs, not enough to name it. */
const okeyPrefix = (okey: string) => okey.slice(0, 8);

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new HttpsError('invalid-argument', `${field} is required`);
  return value.trim();
}

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'user must be authenticated.');
  return uid;
}

/** "24.10.2026 14:30" in Swiss wall-clock time — functions run in UTC. */
function zurichNowForDisplay(): string {
  return new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date()).replace(',', '');
}

/** The relying party for a tenant, as the client asked for it, if we serve it. Throws invalid-argument otherwise. */
async function relyingParty(tenantId: string, requestedRpId: string, clientOrigin: string): Promise<{ rpId: string; origin: string }> {
  let appDomain = '';
  try {
    appDomain = await tenantAppDomain(tenantId);
  } catch {
    // unknown tenant or no appDomain: only localhost can still resolve below
  }
  const rpId = resolveRpId(requestedRpId, appDomain);
  const origin = rpId ? expectedOrigin(rpId, clientOrigin) : undefined;
  if (!rpId || !origin) {
    logger.warn(`${CF_NAME}: rpId/origin not served for ${tenantId}`, { requestedRpId });
    throw new HttpsError('invalid-argument', 'Diese Adresse unterstützt keine Passkeys.');
  }
  return { rpId, origin };
}

async function storeChallenge(c: ChallengeDoc): Promise<string> {
  const ref = challenges().doc();
  await ref.set({ ...c, expireAt: Timestamp.fromMillis(c.expiresAt) });
  return ref.id;
}

/**
 * Reads and deletes the challenge in one transaction — single use even when what was read turns
 * out to be unusable — then checks purpose and expiry. Returns undefined when it cannot be used.
 */
async function consumeChallenge(challengeId: string, purpose: ChallengePurpose): Promise<ChallengeDoc | undefined> {
  if (!isCredentialId(challengeId)) return undefined; // auto ids are [A-Za-z0-9]; never let a '/' reach doc()
  const ref = challenges().doc(challengeId);
  const stored = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return undefined;
    tx.delete(ref);
    return snap.data() as ChallengeDoc;
  });
  return isChallengeUsable(stored, purpose, Date.now()) ? stored : undefined;
}

async function userData(uid: string): Promise<Record<string, unknown> | undefined> {
  const snap = await db().collection(UserCollection).doc(uid).get();
  return snap.exists ? snap.data() : undefined;
}

const tenantsOf = (data: Record<string, unknown> | undefined): string[] =>
  Array.isArray(data?.['tenants']) ? (data['tenants'] as unknown[]).filter((t): t is string => typeof t === 'string') : [];

/**
 * The caller for mayManagePasskey: tenant per getCallerContext (users/{uid}.tenants[0], never the
 * request), admin per users/{uid}.roles.admin (the model the rules and checkAdminRole use).
 */
async function managingCaller(request: CallableRequest): Promise<{ uid: string; isAdmin: boolean; tenants: string[] }> {
  const ctx = await getCallerContext(request, CF_NAME);
  const uid = requireUid(request);
  const roles = (await userData(uid))?.['roles'] as Record<string, unknown> | undefined;
  return { uid, isAdmin: roles?.['admin'] === true, tenants: [ctx.tenantId] };
}

// ---------------------------------------------------------------------------------------------
// registration (signed in)

/** Account label a password manager shows: never the synthetic x@login.<domain> address. */
function registrationUserName(user: Record<string, unknown>, displayName: string, uid: string): string {
  const loginEmail = String(user['loginEmail'] ?? '');
  if (loginEmail !== '' && !isSyntheticLoginEmail(loginEmail)) return loginEmail;
  return String(user['loginId'] ?? '') || displayName || uid;
}

async function registerOptions(request: CallableRequest, data: PasskeyRequest) {
  const uid = requireUid(request);
  if (!isRecentSignIn(request.auth?.token.auth_time, Date.now())) {
    throw new HttpsError('failed-precondition', 'recent-login-required');
  }
  const tenantId = requireString(data.tenantId, 'tenantId');
  const user = await userData(uid);
  if (!user || !tenantsOf(user).includes(tenantId)) {
    logger.warn(`${CF_NAME}: registerOptions for users/${uid} outside its tenants (${tenantId})`);
    throw new HttpsError('permission-denied', 'Passkeys kannst du nur in deiner eigenen App einrichten.');
  }
  const { rpId, origin } = await relyingParty(tenantId, requireString(data.rpId, 'rpId'), requireString(data.origin, 'origin'));

  const existing = await passkeys().where('uid', '==', uid).get();
  const excludeCredentials = existing.docs
    .filter((d) => d.data()['rpId'] === rpId)
    .map((d) => ({ id: d.id, transports: (d.data()['transports'] as string[] | undefined) ?? [] }));

  const { appName } = await getAppEmailConfig(tenantId);
  const displayName = `${String(user['firstName'] ?? '')} ${String(user['lastName'] ?? '')}`.trim();
  const options = await generateRegistrationOptions({
    rpName: appName,
    rpID: rpId,
    userName: registrationUserName(user, displayName, uid),
    userID: isoUint8Array.fromUTF8String(uid),
    userDisplayName: displayName,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  const challengeId = await storeChallenge({
    purpose: 'register', challenge: options.challenge, rpId, origin, uid, tenantId, expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { challengeId, options };
}

async function registerVerify(request: CallableRequest, data: PasskeyRequest): Promise<{ item: PasskeyItem }> {
  const uid = requireUid(request);
  const tenantId = requireString(data.tenantId, 'tenantId');
  const challengeId = requireString(data.challengeId, 'challengeId');
  if (typeof data.response !== 'object' || data.response === null) throw new HttpsError('invalid-argument', 'response is required');
  const response = data.response as RegistrationResponseJSON;
  const notVerified = () => new HttpsError('invalid-argument', 'Der Passkey konnte nicht überprüft werden. Bitte versuche es noch einmal.');

  // burn the challenge first, whatever happens next
  const stored = await consumeChallenge(challengeId, 'register');
  if (!stored || stored.uid !== uid || stored.tenantId !== tenantId) {
    logger.warn(`${CF_NAME}: registerVerify with an unusable challenge (users/${uid})`);
    throw notVerified();
  }
  const user = await userData(uid);
  if (!user || !tenantsOf(user).includes(tenantId)) {
    throw new HttpsError('permission-denied', 'Passkeys kannst du nur in deiner eigenen App einrichten.');
  }

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: stored.origin,
      expectedRPID: stored.rpId,
      requireUserVerification: true,
    });
  } catch (error) {
    logger.warn(`${CF_NAME}: registration not verified (users/${uid})`, { code: errorCode(error) });
    throw notVerified();
  }
  if (!verification.verified) throw notVerified();

  const info = verification.registrationInfo;
  const okey = info.credential.id;
  if (!isCredentialId(okey)) throw notVerified();
  const now = toStoreDateTime(new Date());
  const label = defaultPasskeyLabel(String(request.rawRequest?.headers?.['user-agent'] ?? ''));
  const doc: PasskeyDoc = {
    uid,
    tenants: [tenantId],
    rpId: stored.rpId,
    publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    aaguid: info.aaguid,
    backedUp: info.credentialBackedUp,
    label,
    createdAt: now,
    lastUsedAt: '',
  };
  try {
    // create(), not set(): an existing credential id (whoever's) is never overwritten
    await passkeys().doc(okey).create(doc);
  } catch (error) {
    logger.warn(`${CF_NAME}: passkey ${okeyPrefix(okey)}… not stored (users/${uid})`, { code: errorCode(error) });
    throw new HttpsError('already-exists', 'Dieser Passkey ist bereits eingerichtet.');
  }
  logger.info(`${CF_NAME}: passkey ${okeyPrefix(okey)}… registered for users/${uid} (${tenantId})`);

  await notifyPasskeyAdded(uid, tenantId, label);
  return { item: toPasskeyItem(okey, doc as unknown as Record<string, unknown>) };
}

/** D6: tell the account holder a passkey was added. Best effort — never fails the registration. */
async function notifyPasskeyAdded(uid: string, tenantId: string, label: string): Promise<void> {
  try {
    const email = (await getAuth().getUser(uid)).email ?? '';
    if (email === '' || isSyntheticLoginEmail(email)) {
      logger.info(`${CF_NAME}: users/${uid} has no deliverable address — no passkey notice sent.`);
      return;
    }
    const configSnap = await db().collection('app-config').doc(tenantId).get();
    const provider = String(configSnap.data()?.['emailProvider'] ?? DEFAULT_EMAIL_PROVIDER);
    if (!isValidProvider(provider)) {
      logger.warn(`${CF_NAME}: tenant ${tenantId} declares an unknown email provider — no passkey notice sent.`);
      return;
    }
    const { appName, from } = await getAppEmailConfig(tenantId);
    const { subject, html } = passkeyAddedMail(appName, label, zurichNowForDisplay());
    await sendEmailViaProvider(provider, { from, to: [email], subject, html });
  } catch (err) {
    logger.warn(`${CF_NAME}: passkey notice failed: ${errorCode(err)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// login (signed out)

async function loginOptions(data: PasskeyRequest) {
  const tenantId = requireString(data.tenantId, 'tenantId');
  const { rpId, origin } = await relyingParty(tenantId, requireString(data.rpId, 'rpId'), requireString(data.origin, 'origin'));
  // discoverable credentials: no allowCredentials, the OS offers the passkeys it holds for rpId
  const options = await generateAuthenticationOptions({ rpID: rpId, userVerification: 'required' });
  const challengeId = await storeChallenge({
    purpose: 'login', challenge: options.challenge, rpId, origin, tenantId, expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { challengeId, options };
}

/** Why a login was refused — server logs only, never the client. */
type LoginOutcome = { token: string } | { reject: string; okey?: string };

async function attemptLogin(tenantId: string, challengeId: string, response: AuthenticationResponseJSON): Promise<LoginOutcome> {
  const stored = await consumeChallenge(challengeId, 'login');
  if (!stored || stored.tenantId !== tenantId) return { reject: 'challenge unusable' };

  const okey = response.id;
  if (!isCredentialId(okey)) return { reject: 'malformed credential id' };
  const pkSnap = await passkeys().doc(okey).get();
  if (!pkSnap.exists) return { reject: 'unknown passkey', okey };
  const pk = pkSnap.data() as PasskeyDoc;

  const user = await userData(pk.uid);
  let authDisabled: boolean;
  try {
    authDisabled = (await getAuth().getUser(pk.uid)).disabled;
  } catch {
    return { reject: 'no auth account', okey };
  }
  const target = checkLoginTarget({
    passkey: { uid: pk.uid, rpId: pk.rpId, tenants: pk.tenants ?? [] },
    userTenants: user ? tenantsOf(user) : undefined,
    authDisabled,
    tenantId,
    rpId: stored.rpId,
  });
  if (target !== 'ok') return { reject: 'login target refused', okey };

  // A discoverable credential carries the user.id we set at registration (the uid) — it must match.
  const userHandle = response.response?.userHandle;
  if (userHandle && isoBase64URL.toUTF8String(userHandle) !== pk.uid) return { reject: 'user handle mismatch', okey };

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: stored.origin,
      expectedRPID: stored.rpId,
      credential: {
        id: okey,
        publicKey: isoBase64URL.toBuffer(pk.publicKey),
        counter: pk.counter ?? 0,
        transports: pk.transports ?? [],
      },
      requireUserVerification: true,
    });
  } catch (error) {
    const code = errorCode(error);
    if (/counter/i.test(code)) {
      logger.error(`${CF_NAME}: possible cloned passkey ${okeyPrefix(okey)}… — signature counter did not increase`);
      return { reject: 'counter', okey };
    }
    return { reject: `assertion not verified: ${code}`, okey };
  }
  if (!verification.verified) return { reject: 'assertion not verified', okey };

  await passkeys().doc(okey).update({
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: toStoreDateTime(new Date()),
  });
  return { token: await getAuth().createCustomToken(pk.uid) };
}

async function loginVerify(data: PasskeyRequest, started: number): Promise<{ token: string }> {
  const tenantId = requireString(data.tenantId, 'tenantId');
  const challengeId = requireString(data.challengeId, 'challengeId');
  if (typeof data.response !== 'object' || data.response === null) throw new HttpsError('invalid-argument', 'response is required');

  const fail = async (): Promise<never> => {
    const wait = FAILURE_FLOOR_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    throw new HttpsError('unauthenticated', 'Anmeldung nicht erfolgreich');
  };

  let outcome: LoginOutcome;
  try {
    outcome = await attemptLogin(tenantId, challengeId, data.response as AuthenticationResponseJSON);
  } catch (error) {
    // Firestore, Auth or a malformed response throwing: same generic answer, same floor.
    outcome = { reject: `unexpected: ${errorCode(error)}` };
  }
  if ('token' in outcome) {
    logger.info(`${CF_NAME}: passkey sign-in (${tenantId})`);
    return { token: outcome.token };
  }
  logger.warn(`${CF_NAME}: passkey sign-in refused (${tenantId}): ${outcome.reject}`, outcome.okey ? { passkey: `${okeyPrefix(outcome.okey)}…` } : {});
  return fail();
}

// ---------------------------------------------------------------------------------------------
// management (signed in)

async function list(request: CallableRequest, data: PasskeyRequest): Promise<{ items: PasskeyItem[] }> {
  const callerUid = requireUid(request);
  const uid = requireString(data.uid, 'uid');
  const caller = await managingCaller(request);
  if (uid !== callerUid) {
    const target = await userData(uid);
    if (!target || !mayManagePasskey(caller, { uid, tenants: tenantsOf(target) })) {
      logger.warn(`${CF_NAME}: users/${callerUid} may not list the passkeys of users/${uid}`);
      throw new HttpsError('permission-denied', 'Du darfst diese Passkeys nicht ansehen.');
    }
  }
  const snap = await passkeys().where('uid', '==', uid).get();
  const items = snap.docs
    // an admin sees only the passkeys of the tenants they administer
    .filter((d) => mayManagePasskey(caller, { uid: String(d.data()['uid'] ?? ''), tenants: tenantsOf(d.data()) }))
    .map((d) => toPasskeyItem(d.id, d.data()))
    .sort(byCreatedAtDesc);
  return { items };
}

async function rename(request: CallableRequest, data: PasskeyRequest): Promise<{ item: PasskeyItem }> {
  const uid = requireUid(request);
  const okey = data.okey;
  const label = normalizePasskeyLabel(data.label);
  if (!isCredentialId(okey)) throw new HttpsError('invalid-argument', 'okey is required');
  if (label === undefined) throw new HttpsError('invalid-argument', `Die Bezeichnung muss 1 bis ${PASSKEY_LABEL_MAX} Zeichen lang sein.`);
  const ref = passkeys().doc(okey);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.['uid'] !== uid) {
    throw new HttpsError('permission-denied', 'Du kannst nur deine eigenen Passkeys umbenennen.');
  }
  await ref.update({ label });
  return { item: toPasskeyItem(okey, { ...snap.data(), label }) };
}

async function remove(request: CallableRequest, data: PasskeyRequest): Promise<{ ok: true }> {
  requireUid(request);
  const okey = data.okey;
  if (!isCredentialId(okey)) throw new HttpsError('invalid-argument', 'okey is required');
  const caller = await managingCaller(request);
  const ref = passkeys().doc(okey);
  const snap = await ref.get();
  const pk = snap.data();
  if (!snap.exists || !mayManagePasskey(caller, { uid: String(pk?.['uid'] ?? ''), tenants: tenantsOf(pk) })) {
    throw new HttpsError('permission-denied', 'Du darfst diesen Passkey nicht löschen.');
  }
  await ref.delete();
  logger.info(`${CF_NAME}: passkey ${okeyPrefix(okey)}… of users/${String(pk?.['uid'])} deleted by users/${caller.uid}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------

export const passkey = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, secrets: MAIL_SECRETS },
  async (request) => {
    checkAppCheckToken(request, CF_NAME);
    const started = Date.now();
    const data = (request.data ?? {}) as PasskeyRequest;
    switch (data.op) {
      case 'registerOptions': return registerOptions(request, data);
      case 'registerVerify': return registerVerify(request, data);
      case 'loginOptions': return loginOptions(data);
      case 'loginVerify': return loginVerify(data, started);
      case 'list': return list(request, data);
      case 'rename': return rename(request, data);
      case 'delete': return remove(request, data);
      default: throw new HttpsError('invalid-argument', 'unknown op');
    }
  },
);
