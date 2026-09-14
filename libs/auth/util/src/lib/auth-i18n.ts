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
  // The set-password screen needs its own helper: password.helper talks about a button that
  // only exists on the login screen, and on the confirm page there is no such button at all.
  password_new_label:       PFX + 'password.newLabel',
  password_new_placeholder: PFX + 'password.newPlaceholder',
  password_new_helper:      PFX + 'password.newHelper',
  account_label:            PFX + 'password.accountLabel',

  pwdreset_title:           PFX + 'pwdreset.title',
  // The call to action on the login screen. Separate from pwdreset_title (the page heading)
  // because the two have to read differently: one names a destination, the other offers a way out.
  pwdreset_cta:             PFX + 'pwdreset.cta',
  // The label while the request is in flight. Sending goes through a Cloud Function and can take
  // a few seconds; without a label the screen looked unchanged and people pressed again.
  pwdreset_sending:         PFX + 'pwdreset.sending',
  // The state the login screen switches to once the mail is on its way.
  sent_title:               PFX + 'pwdreset.sent.title',
  sent_body:                PFX + 'pwdreset.sent.body',
  sent_spam:                PFX + 'pwdreset.sent.spam',
  sent_resend:              PFX + 'pwdreset.sent.resend',
  sent_resent:              PFX + 'pwdreset.sent.resent',
  sent_other:               PFX + 'pwdreset.sent.other',
  sent_help:                PFX + 'pwdreset.sent.help',
  newpwd:                   PFX + 'pwdreset.newpwd',
  invalid_link:             PFX + 'pwdreset.invalidLink',
  checking:                 PFX + 'pwdreset.checking',
  success:                  PFX + 'pwdreset.success',
  savepwd:                  PFX + 'pwdreset.savepwd',
  pwdconfirm:               PFX + 'pwdconfirm',

  // one message per PwdResetFailure — see pwd-reset-result.ts
  error_expired:            PFX + 'pwdreset.error.expired',
  error_used:               PFX + 'pwdreset.error.used',
  error_noAccount:          PFX + 'pwdreset.error.noAccount',
  error_weakPassword:       PFX + 'pwdreset.error.weakPassword',
  error_network:            PFX + 'pwdreset.error.network',
  error_tooShort:           PFX + 'pwdreset.error.tooShort',
  request_new_link:         PFX + 'pwdreset.requestNewLink',
  goto_login:               PFX + 'pwdreset.gotoLogin',

  roles_label:              PFX + 'roles.label',
  roles_helper:             PFX + 'roles.helper',

  cancel:                   '@cancel',
  ok:                       '@ok',
  validation_emailRequired: '@validation.emailRequired',
  validation_passwordRequired: '@validation.passwordRequired',

  background_alt:           PFX + 'background.alt',
  password_changed:         PFX + 'password.changed',
} satisfies Record<string, string>;

export type AuthI18n = { [K in keyof typeof AUTH_I18N_KEYS]: Signal<string> };
