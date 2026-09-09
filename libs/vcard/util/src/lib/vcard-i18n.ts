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

  import_label: PFX + 'import.label',
  import_title: PFX + 'import.title',
  import_intro: PFX + 'import.intro',
  import_status_new: PFX + 'import.status.new',
  import_status_duplicate: PFX + 'import.status.duplicate',
  import_action_import: PFX + 'import.action.import',
  import_action_merge: PFX + 'import.action.merge',
  import_action_skip: PFX + 'import.action.skip',
  import_action_createAnyway: PFX + 'import.action.createAnyway',
  import_create_org: PFX + 'import.create.org',
  import_create_person: PFX + 'import.create.person',
  import_link_none: PFX + 'import.link.none',
  import_notes_label: PFX + 'import.notes.label',
  import_summary: PFX + 'import.summary',
  import_noCards: PFX + 'import.noCards',
  import_notAllowed: PFX + 'import.notAllowed',
  import_running: PFX + 'import.running',
  import_start: PFX + 'import.start',

  cancel: '@cancel',
  ok: '@ok',
  save: '@save.label',
} satisfies Record<string, string>;

export type VcardI18n = { [K in keyof typeof VCARD_I18N_KEYS]: Signal<string> };
