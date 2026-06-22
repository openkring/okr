import { Signal } from '@angular/core';

const PFX = '@finance/account/feature.';

export const ACCOUNT_I18N_KEYS = {
  accounts:             PFX + 'accounts',
  empty:                PFX + 'empty',

  create:               PFX + 'create',
  delete:               PFX + 'delete',
  select_root:          PFX + 'select.root',
  select_hint:          PFX + 'select.hint',
  update:               PFX + 'update',
  view:                 PFX + 'view',

  bkey:                 PFX + 'bkey.label',
  bkey_placeholder:     PFX + 'bkey.placeholder',
  bkey_helper:          PFX + 'bkey.helper',

  id:                   PFX + 'id.label',
  id_placeholder:       PFX + 'id.placeholder',
  id_helper:            PFX + 'id.helper',

  name:                 PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',

  label:                PFX + 'label.label',
  label_placeholder:    PFX + 'label.placeholder',
  label_helper:         PFX + 'label.helper',

  parentId:             PFX + 'parentId.label',
  parentId_placeholder: PFX + 'parentId.placeholder',
  parentId_helper:      PFX + 'parentId.helper',

  notes:                PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',

  as_title:             '@actionsheet.title',
  save:                 '@save.label',
  cancel:               '@cancel',
  ok:                   '@ok',
} satisfies Record<string, string>;

export type AccountI18n = { [K in keyof typeof ACCOUNT_I18N_KEYS]: Signal<string> };
