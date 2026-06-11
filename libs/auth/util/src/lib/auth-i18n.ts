import { Signal } from '@angular/core';

const PFX = '@auth/feature.';

export const AUTH_I18N_KEYS = {
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
  newpwd:                   PFX + 'pwdreset.newpwd',
  invalid_link:             PFX + 'pwdreset.invalidLink',
  success:                  PFX + 'pwdreset.success',
  savepwd:                  PFX + 'pwdreset.savepwd',
  pwdconfirm:               PFX + 'pwdconfirm',

  roles_label:              PFX + 'roles.label',
  roles_helper:             PFX + 'roles.helper',

  cancel:                   '@cancel',
  ok:                       '@ok',
  validation_emailRequired: '@validation.emailRequired',
  validation_passwordRequired: '@validation.passwordRequired',
} satisfies Record<string, string>;

export type AuthI18n = { [K in keyof typeof AUTH_I18N_KEYS]: Signal<string> };
