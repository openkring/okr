import type { Signal } from '@angular/core';

// Global translation keys (no scope prefix → resolved from the app's global de.json).
const PFX = '@vcard.';

export const VCARD_I18N_KEYS = {
  action_label: PFX + 'action.label',

  modal_title: PFX + 'modal.title',
  modal_intro: PFX + 'modal.intro',

  scope_addresses: PFX + 'scope.addresses',
  scope_phone: PFX + 'scope.phone',
  scope_email: PFX + 'scope.email',
  scope_postal: PFX + 'scope.postal',
  scope_web: PFX + 'scope.web',
  scope_birthday: PFX + 'scope.birthday',
  scope_photo: PFX + 'scope.photo',
  scope_workRels: PFX + 'scope.workRels',
  scope_personalRels: PFX + 'scope.personalRels',
  scope_orgLinks: PFX + 'scope.orgLinks',

  export_conf: PFX + 'export.conf',
  export_error: PFX + 'export.error',
  not_allowed: PFX + 'export.notAllowed',

  cancel: '@cancel',
  ok: '@ok',
  save: '@save.label',
} satisfies Record<string, string>;

export type VcardI18n = { [K in keyof typeof VCARD_I18N_KEYS]: Signal<string> };
