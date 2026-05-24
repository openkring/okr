import { inject, Signal } from '@angular/core';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';

const AUTH_I18N_KEYS = {
  title:                    PFX + 'title',
  email_label:              PFX + 'email.label',
  email_placeholder:        PFX + 'email.placeholder',
  email_error:              PFX + 'email.error',
  email_helper:             PFX + 'email.helper',
  password_label:           PFX + 'password.label',
  password_placeholder:     PFX + 'password.placeholder',
  password_error:           PFX + 'password.error',
  password_helper:          PFX + 'password.helper',
  pwdreset_title:           PFX + 'pwdreset.title',
  pwdconfirm:               PFX + 'pwdconfirm',
  newpwd:                   PFX + 'pwdreset.newpwd',
  invalid_link:             PFX + 'pwdreset.invalidLink',
  success:                  PFX + 'pwdreset.success',
  savepwd:                  PFX + 'pwdreset.savepwd',
  cancel:                   '@cancel',
  ok:                       '@ok',
} satisfies Record<string, string>;

export type AuthI18n = { [K in keyof typeof AUTH_I18N_KEYS]: Signal<string> };

export const AuthStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(AUTH_I18N_KEYS),
  })),
);
