import { Signal } from '@angular/core';

export const PFX = '@business/contract/util.';

export const CONTRACT_I18N_KEYS = {
  plural: PFX + 'plural', add: PFX + 'add', edit: PFX + 'edit', myPlural: PFX + 'myPlural',
  create_conf: PFX + 'create.conf', create_error: PFX + 'create.error',
  update_conf: PFX + 'update.conf', update_error: PFX + 'update.error',
  archive_confirm: PFX + 'archive.confirm', notice_title: PFX + 'notice.title',
  summarize: PFX + 'summarize', dossier: PFX + 'dossier', deadlines: PFX + 'deadlines',
  upload: PFX + 'upload', priorVersions: PFX + 'priorVersions', empty: PFX + 'empty',
} as const;

export type ContractI18n = { [K in keyof typeof CONTRACT_I18N_KEYS]: Signal<string> };
