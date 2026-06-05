import { Signal } from '@angular/core';

const PFX = '@cms/icon/feature.';

export const ICON_I18N_KEYS = {
  icon:             PFX + 'icon',
  icons:            PFX + 'icons',
  empty:            PFX + 'empty',

  copy:             PFX + 'copy.label',
  create:           PFX + 'create.label',
  create_conf:      PFX + 'create.conf',
  create_error:     PFX + 'create.error',
  delete:           PFX + 'delete.label',
  delete_conf:      PFX + 'delete.conf',
  delete_error:     PFX + 'delete.error',
  delete_confirm:   PFX + 'delete.confirm',
  exportRaw:        PFX + 'exportRaw.label',
  sync:             PFX + 'sync.label',
  select:           PFX + 'select.label',
  update:           PFX + 'update.label',
  update_conf:      PFX + 'update.conf',
  update_error:     PFX + 'update.error',
  view:             PFX + 'view.label',

  bkey_label:        PFX + 'bkey.label',
  bkey_placeholder:  PFX + 'bkey.placeholder',
  bkey_helper:       PFX + 'bkey.helper',

  name_label:        PFX + 'name.label',
  name_placeholder:  PFX + 'name.placeholder',
  name_helper:       PFX + 'name.helper',
  name_button:       PFX + 'name.button',
  name_menu:         PFX + 'name.menu',
  name_error:        PFX + 'name.error',

  type_label:        PFX + 'type.label',
  type_placeholder:  PFX + 'type.placeholder',
  type_helper:       PFX + 'type.helper',

  fullPath_label:    PFX + 'fullPath.label',
  fullPath_placeholder: PFX + 'fullPath.placeholder',
  fullPath_helper:   PFX + 'fullPath.helper',

  index_label:       PFX + 'index.label',
  index_placeholder: PFX + 'index.placeholder',
  index_helper:      PFX + 'index.helper',

  notes_label:       PFX + 'notes.label',
  notes_placeholder: PFX + 'notes.placeholder',

  size_label:         PFX + 'size.label',
  size_placeholder:   PFX + 'size.placeholder',
  size_helper:        PFX + 'size.helper',
  size_error:         PFX + 'size.error',

  slot_label:         PFX + 'slot.label',
  slot_placeholder:   PFX + 'slot.placeholder',
  slot_helper:        PFX + 'slot.helper',
  
  updated:          PFX + 'updated',

  as_title:         '@actionsheet.title',
  save:             '@save.label',
  cancel:           '@cancel',
  ok:               '@ok'
} satisfies Record<string, string>;

export type IconI18n = { [K in keyof typeof ICON_I18N_KEYS]: Signal<string> };
