import { Signal } from '@angular/core';

export const AUTH_I18N_KEYS = {
  title:                    '@auth/feature.title',
  email_label:              '@auth/feature.email.label',
  email_placeholder:        '@auth/feature.email.placeholder',
  email_error:              '@auth/feature.email.error',
  email_helper:             '@auth/feature.email.helper',
  password_label:           '@auth/feature.password.label',
  password_placeholder:     '@auth/feature.password.placeholder',
  password_error:           '@auth/feature.password.error',
  password_helper:          '@auth/feature.password.helper',
  pwdreset_title:           '@auth/feature.pwdreset.title',
  pwdconfirm:               '@auth/feature.pwdconfirm',
  newpwd:                   '@auth/feature.pwdreset.newpwd',
  invalid_link:             '@auth/feature.pwdreset.invalidLink',
  success:                  '@auth/feature.pwdreset.success',
  savepwd:                  '@auth/feature.pwdreset.savepwd',
  cancel:                   '@cancel',
  ok:                       '@ok',
  validation_emailRequired: '@validation.emailRequired',
  validation_passwordRequired: '@validation.passwordRequired',
} satisfies Record<string, string>;

export type AuthI18n = { [K in keyof typeof AUTH_I18N_KEYS]: Signal<string> };
