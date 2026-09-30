// apps/functions/src/auth/login-with-login-id.ts
//
// Login by Benutzername (spec 1.71 §5.1). The client never learns the account's email: the password is
// verified here against Firebase Auth, and the client receives a custom token for the uid.

import { createHash } from 'node:crypto';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { checkAppCheckToken } from '@okr/shared-util-functions';
import { normalizeLoginIdInput } from '@okr/user-util';

import { afterFailure, isLocked, mapSignInError, ThrottleState } from './login-id.decide';
import { findUserByLoginId, tenantAppDomain } from './login-id';

const CF_NAME = 'loginWithLoginId';
// The Firebase Web API key (public — it already ships in every app's environment.ts). Declared as a
// secret purely for delivery, matching the repo convention (see DIARY_OWNER_UID in import-diary.ts):
// every .env file is git-ignored and dist/apps/functions is rebuilt on every deploy, so a defineString
// param has nowhere to persist and would prompt on every unrelated functions deploy.
const WEB_API_KEY = defineSecret('FIREBASE_WEB_API_KEY');
/** Every failure answers no earlier than this, so "unknown Benutzername" is not measurably faster. */
const FAILURE_FLOOR_MS = 900;

const throttleRef = (tenantId: string, loginId: string) =>
  getFirestore().collection('login-throttle').doc(createHash('sha256').update(`${tenantId}:${loginId}`).digest('hex'));

async function verifyPassword(email: string, password: string, appCheckToken: string, appDomain: string): Promise<'ok' | 'invalid' | 'throttled' | 'error'> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY.value()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheckToken, Referer: `https://${appDomain}/` },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  if (response.ok) return 'ok';
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return mapSignInError(body.error?.message ?? String(response.status));
}

export const loginWithLoginId = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true, secrets: [WEB_API_KEY] },
  async (request) => {
    checkAppCheckToken(request, CF_NAME);
    const started = Date.now();
    const data = request.data as { tenantId?: string; loginId?: string; password?: string };
    const tenantId = String(data?.tenantId ?? '');
    const loginId = normalizeLoginIdInput(String(data?.loginId ?? ''));
    const password = String(data?.password ?? '');
    if (!tenantId || !loginId || !password) throw new HttpsError('invalid-argument', 'tenantId, loginId and password are required');

    const fail = async (code: 'unauthenticated' | 'resource-exhausted'): Promise<never> => {
      const wait = FAILURE_FLOOR_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      throw new HttpsError(code, code === 'unauthenticated' ? 'Anmeldung nicht erfolgreich' : 'Zu viele Versuche');
    };

    const ref = throttleRef(tenantId, loginId);
    const state = (await ref.get()).data() as ThrottleState | undefined;
    if (isLocked(state, Date.now())) return fail('resource-exhausted');

    const user = await findUserByLoginId(tenantId, loginId);
    let outcome: 'ok' | 'invalid' | 'throttled' | 'error' = 'invalid';
    if (user) {
      const email = (await getAuth().getUser(user.uid)).email ?? '';
      // Header names arrive lower-cased on request.rawRequest (Express/Connect convention) — see
      // apps/functions/src/forms/index.ts for the same accessor pattern.
      const appCheckToken = (request.rawRequest.headers['x-firebase-appcheck'] as string | undefined) ?? '';
      outcome = email ? await verifyPassword(email, password, appCheckToken, await tenantAppDomain(tenantId)) : 'invalid';
    }

    if (outcome === 'ok' && user) {
      await ref.delete();
      logger.info(`${CF_NAME}: users/${user.uid} signed in by Benutzername (${tenantId})`);
      return { token: await getAuth().createCustomToken(user.uid) };
    }
    if (outcome === 'error') logger.error(`${CF_NAME}: password check failed unexpectedly (${tenantId}) — see the spike notes`);
    const next = afterFailure(state, Date.now());
    await ref.set({ ...next, expireAt: Timestamp.fromMillis(Date.now() + 24 * 3600_000) });
    return fail(outcome === 'throttled' || next.lockedUntil > 0 ? 'resource-exhausted' : 'unauthenticated');
  },
);
