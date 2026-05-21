import { inject, Signal } from '@angular/core';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';

const AUTH_I18N_KEYS = {
  login_title: '@auth.operation.login.title',
  pwdreset_title: '@auth.operation.pwdreset.title',
  pwdconfirm_title: '@auth.operation.pwdconfirm.title',
  cancel: '@general.operation.change.cancel',
  ok: '@general.operation.change.ok',
  newpwd: '@user.auth.pwdreset.newpwd',
  invalid_link: '@user.auth.pwdreset.invalidLink',
  success: '@user.auth.pwdreset.success',
  savepwd: '@user.auth.pwdreset.savepwd',
  loginEmail_label:          '@auth/ui.loginEmail.label',
  loginEmail_placeholder:    '@auth/ui.loginEmail.placeholder',
  loginPassword_label:       '@auth/ui.loginPassword.label',
  loginPassword_placeholder: '@auth/ui.loginPassword.placeholder',
} satisfies Record<string, string>;

export type AuthI18n = { [K in keyof typeof AUTH_I18N_KEYS]: Signal<string> };

export const AuthStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(AUTH_I18N_KEYS),
  })),
);
