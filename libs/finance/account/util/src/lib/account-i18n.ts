import { Signal } from '@angular/core';

const PFX = '@finance/account/feature.';

export const ACCOUNT_I18N_KEYS = {
  accounts:             PFX + 'accounts',
  empty:                PFX + 'empty',
  id:                   PFX + 'id',
  name:                 PFX + 'name',
  select_root:          PFX + 'select.root',
  select_hint:          PFX + 'select.hint',
  as_title:             PFX + 'actionsheet.title',
  as_view:              PFX + 'actionsheet.view',
  as_edit:              PFX + 'actionsheet.edit',
  as_create:            PFX + 'actionsheet.create',
  as_delete:            PFX + 'actionsheet.delete',
  save:                 '@save.label',
  cancel:               '@cancel',
  ok:                   '@ok',
  bkey_label:           PFX + 'bkey.label',
  bkey_placeholder:     PFX + 'bkey.placeholder',
  bkey_helper:          PFX + 'bkey.helper',
  id_label:             PFX + 'id.label',
  id_placeholder:       PFX + 'id.placeholder',
  id_helper:            PFX + 'id.helper',
  name_label:           PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',
  label_label:          PFX + 'label.label',
  label_placeholder:    PFX + 'label.placeholder',
  label_helper:         PFX + 'label.helper',
  parentId_label:       PFX + 'parentId.label',
  parentId_placeholder: PFX + 'parentId.placeholder',
  parentId_helper:      PFX + 'parentId.helper',
  notes_label:          PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',
} satisfies Record<string, string>;

export type AccountI18n = { [K in keyof typeof ACCOUNT_I18N_KEYS]: Signal<string> };
