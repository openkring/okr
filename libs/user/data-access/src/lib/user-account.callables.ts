import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { FirebaseUserModel } from '@okr/shared-models';
import { isAuthUserNotFound } from '@okr/user-util';

/*
 * The account callables behind the «Benutzer & Zugänge» row actions (spec 1.101 phase 4). Moved
 * here from the former AOC pages «User Accounts» / «Berechtigungen» (and @okr/aoc-util) with
 * their payloads unchanged; every one of them is admin-only on the server.
 */

function functions(useEmulators = false) {
  const fns = getFunctions(getApp(), 'europe-west6');
  if (useEmulators) connectFunctionsEmulator(fns, 'localhost', 5001);
  return fns;
}

function callable<Req, Res>(name: string, useEmulators = false) {
  return httpsCallable<Req, Res>(functions(useEmulators), name);
}

/** One `authAdmin` router op (3.41): the old callable name travels as `op`, payload and result stay as they were. */
function authAdminOp<Req, Res>(op: string, useEmulators = false) {
  const fn = callable<Req & { op: string }, Res>('authAdmin', useEmulators);
  return (data: Req) => fn({ op, ...data });
}

/** The Firebase error code of a failed callable, without the 'functions/' prefix. */
export function callableErrorCode(ex: unknown): string {
  return String((ex as { code?: string })?.code ?? '').replace(/^functions\//, '');
}

/** What syncPersonAccount({ action: 'open' }) hands back — openAccount's result (spec 1.71 §5.3). */
export type OpenAccountResponse = {
  ok: boolean;
  outcome?: 'created' | 'createdWithLoginId' | 'exists' | 'noEmail' | 'noPerson';
  uid?: string;
  loginEmail?: string;
  loginId?: string;
};

/**
 * Opens the account through the openAccount Cloud Function (spec 1.71 §5.3) — the one code path
 * that knows the shared-email rule. Creating the Auth identity and the users doc on the client
 * would attach a child's person to the parent's uid when both share one email.
 */
export async function openPersonAccount(personKey: string, tenantId: string): Promise<OpenAccountResponse> {
  const { data } = await authAdminOp<{ personKey: string; tenantId: string; action: 'open' }, OpenAccountResponse>('syncPersonAccount')(
    { personKey, tenantId, action: 'open' });
  return data;
}

/** Deletes a Firebase Auth login (the users doc is not touched). */
export async function deleteFirebaseAuthUser(uid: string): Promise<void> {
  await authAdminOp<{ uid: string }, void>('deleteFirebaseAuthUser')({ uid });
}

/** Sets the Benutzername (spec 1.71 §3); rejects with 'already-exists' when it is taken. */
export async function setLoginId(uid: string, loginId: string): Promise<string> {
  const { data } = await authAdminOp<{ uid: string; loginId: string }, { loginId: string }>('setLoginId')({ uid, loginId });
  return data.loginId;
}

/** The swap (spec 1.71 §6b): the holder hands its login email to the newcomer and gets a Benutzername. */
export async function swapLoginEmail(holderUid: string, newcomerUid: string): Promise<string> {
  const { data } = await authAdminOp<{ holderUid: string; newcomerUid: string }, { holderLoginId: string }>('swapLoginEmail')({ holderUid, newcomerUid });
  return data.holderLoginId;
}

/** Sets a password without a reset mail (the admin then knows it — avoid where possible). */
export async function setPassword(uid: string, password: string, useEmulators = false): Promise<void> {
  await authAdminOp<{ uid: string; password: string }, unknown>('setPassword', useEmulators)({ uid, password });
}

/**
 * The Firebase login of a uid (limited fields), or undefined when there is none. Any other failure
 * (permission, network, server) throws, like the other wrappers, so the caller can say so.
 */
export async function getFirebaseUser(uid: string): Promise<FirebaseUserModel | undefined> {
  let fbUser: FirebaseUserModel;
  try {
    fbUser = (await authAdminOp<{ uid: string }, FirebaseUserModel>('getFirebaseUser')({ uid })).data;
  } catch (ex) {
    if (isAuthUserNotFound(ex)) return undefined;
    throw ex;
  }
  // the admin SDK returns null for unset fields; the form validations reject null
  if (!fbUser.email) fbUser.email = '';
  if (!fbUser.displayName) fbUser.displayName = '';
  if (!fbUser.phone) fbUser.phone = '';
  if (!fbUser.photoUrl) fbUser.photoUrl = '';
  return fbUser;
}

/** Saves a Firebase login as is (it must be complete); the callable's message carries the reason on failure. */
export async function updateFirebaseUser(fbUser: FirebaseUserModel, useEmulators = false): Promise<void> {
  if (fbUser.phone?.length === 0) fbUser.phone = undefined;
  if (fbUser.photoUrl?.length === 0) fbUser.photoUrl = undefined;
  await authAdminOp<FirebaseUserModel, unknown>('updateFirebaseUser', useEmulators)(fbUser);
}

/** A custom token to sign in as `uid` (impersonation). */
export async function createCustomToken(uid: string, useEmulators = false): Promise<string> {
  const result = await authAdminOp<{ uid: string }, string>('createCustomToken', useEmulators)({ uid });
  return result.data;
}

/** Creates (or confirms) the person's Matrix account. */
export async function provisionMatrixUser(personKey: string): Promise<string> {
  const result = await callable<{ personKey: string }, { matrixUserId: string; provisioned: boolean }>('provisionMatrixUser')({ personKey });
  return result.data.matrixUserId;
}

/**
 * A password: the given one, or a 12 char cryptographically secure random string when empty
 * (Web Crypto, not Math.random — CodeQL js/insecure-randomness).
 */
export function generatePassword(password?: string): string {
  if (password && password.length > 0) return password;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < bytes.length; i++) result += charset[bytes[i] % charset.length];
  return result;
}
