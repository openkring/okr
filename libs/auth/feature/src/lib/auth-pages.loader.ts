import type { Type } from '@angular/core';

import type { ConfirmPasswordResetPage } from './confirm-password-reset.page';
import type { LoginPage } from './login.page';
import type { LogoutPage } from './logout.page';
import type { PasskeysModal } from './passkeys.modal';
import type { PasswordResetPage } from './password-reset.page';

/**
 * Loaders for the pages and modals of this lib that are opened by a route or a click (lazy-loading skill, rule 3).
 * Every app imports this barrel statically for its guards, so the barrel is always in the start bundle: an
 * `import('@okr/auth-feature')` would therefore load nothing lazily and keep every page of the lib eager.
 * These relative imports give each page a chunk of its own; importing a loader statically binds only the loader.
 */
export async function loadLoginPage(): Promise<Type<LoginPage>> {
  return (await import('./login.page')).LoginPage;
}

export async function loadLogoutPage(): Promise<Type<LogoutPage>> {
  return (await import('./logout.page')).LogoutPage;
}

export async function loadPasswordResetPage(): Promise<Type<PasswordResetPage>> {
  return (await import('./password-reset.page')).PasswordResetPage;
}

export async function loadConfirmPasswordResetPage(): Promise<Type<ConfirmPasswordResetPage>> {
  return (await import('./confirm-password-reset.page')).ConfirmPasswordResetPage;
}

export async function loadPasskeysModal(): Promise<Type<PasskeysModal>> {
  return (await import('./passkeys.modal')).PasskeysModal;
}
