import { UserModel } from '@okr/shared-models';
import type { ReportFinding } from '@okr/shared-util-core';

import { isSyntheticLoginEmail } from './login-id.util';
import { UserAccountRow } from './user-account-rows.util';

/**
 * What the «Benutzer & Zugänge» row ActionSheet can offer (spec 1.101 phase 4). The account tools
 * of the former AOC pages «User Accounts» and «Berechtigungen» all live here now.
 */
export type UserAccountAction =
  | 'user.edit' | 'person.edit'
  | 'account.open' | 'account.reset' | 'account.password' | 'account.loginid' | 'account.swap' | 'fbuser.edit'
  | 'account.check' | 'account.impersonate' | 'matrix.provision'
  | 'copy.email' | 'copy.uid' | 'copy.pkey'
  | 'user.delete' | 'fbuser.delete';

/** The sheet groups (a divider goes between two groups); the destructive group is always last. */
export function actionGroup(action: UserAccountAction): 'edit' | 'account' | 'diagnose' | 'copy' | 'delete' {
  switch (action) {
    case 'user.edit': case 'person.edit': return 'edit';
    case 'account.open': case 'account.reset': case 'account.password': case 'account.loginid': case 'account.swap': case 'fbuser.edit': return 'account';
    case 'account.check': case 'account.impersonate': case 'matrix.provision': return 'diagnose';
    case 'copy.email': case 'copy.uid': case 'copy.pkey': return 'copy';
    default: return 'delete';
  }
}

/**
 * The actions a row offers, in sheet order. Only what applies to the row kind, and only when the
 * value the action needs is there (a person action needs a personKey, a copy its value).
 * - loginWithoutUser (operator only): copy email/uid, delete the Firebase login
 * - userWithoutLogin: edit user/person, open the account, check, copy, delete the user
 * - memberWithoutAccount: edit the person, open the account, check, copy the personKey
 * - normal: the whole toolbox incl. deleting the login; the email swap only for a Benutzername login
 * «Berechtigung prüfen» needs a personKey and is offered on every row that has one.
 */
export function actionsForRow(row: UserAccountRow, isOperator: boolean): UserAccountAction[] {
  const actions: UserAccountAction[] = [];
  const hasPerson = !!row.personKey;
  const copies = (): void => {
    if (row.loginEmail) actions.push('copy.email');
    if (row.uid) actions.push('copy.uid');
    if (row.personKey) actions.push('copy.pkey');
  };
  switch (row.kind) {
    case 'loginWithoutUser':
      if (!isOperator) return [];
      copies();
      if (row.uid) actions.push('fbuser.delete');
      return actions;
    case 'memberWithoutAccount':
      if (!hasPerson) return [];
      actions.push('person.edit', 'account.open', 'account.check');
      copies();
      return actions;
    case 'userWithoutLogin':
      actions.push('user.edit');
      if (hasPerson) actions.push('person.edit', 'account.open', 'account.check');
      copies();
      actions.push('user.delete');
      return actions;
    case 'normal':
      actions.push('user.edit');
      if (hasPerson) actions.push('person.edit');
      actions.push('account.reset', 'account.password', 'account.loginid');
      if (isSyntheticLoginEmail(row.loginEmail)) actions.push('account.swap');
      actions.push('fbuser.edit');
      if (hasPerson) actions.push('account.check');
      actions.push('account.impersonate');
      if (hasPerson) actions.push('matrix.provision');
      copies();
      // the server (mayDeleteAuthUser) lets a tenant admin delete the login of its own single-tenant user
      actions.push('user.delete', 'fbuser.delete');
      return actions;
  }
}

/**
 * True when a getFirebaseUser failure means "this login does not exist": the tenant check answers
 * `not-found`, the Admin SDK's user-not-found arrives wrapped as `internal` with its message.
 * Every other failure is a real error the caller must report.
 */
export function isAuthUserNotFound(ex: unknown): boolean {
  const { code, message } = (ex ?? {}) as { code?: string; message?: string };
  if (String(code ?? '').replace(/^functions\//, '') === 'not-found') return true;
  return /no user record/i.test(message ?? '');
}

/** What `?edit=<userKey>` on the list asks for (the retired `/user/:userKey` page redirects there). */
export type UserEditRequest =
  | { kind: 'none' }
  | { kind: 'wait' }
  | { kind: 'open'; user: UserModel }
  | { kind: 'missing' };

/**
 * Decides what the list does with an `edit` query param: nothing without a key, wait while the
 * users load, open the user's modal, or report an unknown key once the users are there.
 */
export function userEditRequest(editKey: string | undefined, users: UserModel[], loaded: boolean): UserEditRequest {
  if (!editKey) return { kind: 'none' };
  if (!loaded) return { kind: 'wait' };
  const user = users.find(u => u.okey === editKey);
  return user ? { kind: 'open', user } : { kind: 'missing' };
}

export interface AccountCheckTexts {
  person: string;
  email: string;
  noEmail: string;
  user: string;
  noUser: string;
  login: string;
  noLogin: string;
  linkPerson: string;
  linkLogin: string;
  ok: string;
  roles: string;
  archived: string;
}

export interface AccountCheckInput {
  personKey: string;
  personTenants: string[];
  favEmail: string;
  user: UserModel | undefined;
  login: { uid: string; email?: string } | undefined;
}

const joinParts = (...parts: (string | undefined)[]): string => parts.filter(p => !!p).join(' · ');

/**
 * «Berechtigung prüfen»: person, its email, the user doc and the Firebase login of one account,
 * and whether they point at each other (user → person, login → user).
 */
export function accountCheckFindings(input: AccountCheckInput, texts: AccountCheckTexts): ReportFinding[] {
  const findings: ReportFinding[] = [
    { id: 'person', title: texts.person, detail: joinParts(input.personKey, input.personTenants.join(', ')) },
    { id: 'email', title: texts.email, detail: input.favEmail || texts.noEmail },
  ];
  const user = input.user;
  if (!user) {
    findings.push({ id: 'user', title: texts.user, detail: texts.noUser });
  } else {
    findings.push({ id: 'user', title: texts.user, detail: joinParts(user.okey, user.loginEmail, (user.tenants ?? []).join(', '), user.isArchived ? texts.archived : undefined) });
    findings.push({ id: 'roles', title: texts.roles, detail: Object.entries(user.roles ?? {}).filter(([, on]) => on === true).map(([role]) => role).join(', ') });
    findings.push({ id: 'user-person', title: texts.linkPerson, detail: user.personKey === input.personKey ? texts.ok : `${user.personKey} ≠ ${input.personKey}` });
  }
  const login = input.login;
  if (!login) {
    findings.push({ id: 'login', title: texts.login, detail: texts.noLogin });
  } else {
    findings.push({ id: 'login', title: texts.login, detail: joinParts(login.uid, login.email) });
    if (user) findings.push({ id: 'login-user', title: texts.linkLogin, detail: login.uid === user.okey ? texts.ok : `${login.uid} ≠ ${user.okey}` });
  }
  return findings;
}
