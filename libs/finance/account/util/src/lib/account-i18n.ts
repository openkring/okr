import { Signal } from '@angular/core';

const PFX = '@finance/account/feature.';

export const ACCOUNT_I18N_KEYS = {
  accounts:             PFX + 'accounts',
  empty:                PFX + 'empty',

  create:               PFX + 'create',
  seed:                 PFX + 'seed',
  import_prompt:        PFX + 'import.prompt',
  import_placeholder:   PFX + 'import.placeholder',
  import_done:          PFX + 'import.done',
  import_orphans:       PFX + 'import.orphans',
  import_duplicates:    PFX + 'import.duplicates',
  import_empty:         PFX + 'import.empty',
  import_invalid:       PFX + 'import.invalid',
  delete:               PFX + 'delete',
  delete_conf_one:      PFX + 'deleteConf.one',
  delete_conf_tree:     PFX + 'deleteConf.tree',
  delete_inUse:         PFX + 'deleteConf.inUse',
  select_root:          PFX + 'select.root',
  select_hint:          PFX + 'select.hint',
  select_search:        PFX + 'select.search',
  select_notFound:      PFX + 'select.notFound',
  update:               PFX + 'update',
  view:                 PFX + 'view',

  okey:                 PFX + 'okey.label',
  okey_placeholder:     PFX + 'okey.placeholder',
  okey_helper:          PFX + 'okey.helper',

  id:                   PFX + 'id.label',
  id_placeholder:       PFX + 'id.placeholder',
  id_helper:            PFX + 'id.helper',
  id_duplicate:         PFX + 'id.duplicate',

  name:                 PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',

  kind:                 PFX + 'kind.label',
  kind_helper:          PFX + 'kind.helper',

  parentKey:            PFX + 'parentKey.label',
  parentKey_helper:     PFX + 'parentKey.helper',

  notes:                PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',

  as_title:             '@actionsheet.title',
  save:                 '@save.label',
  cancel:               '@cancel',
  ok:                   '@ok',
} satisfies Record<string, string>;

export type AccountI18n = { [K in keyof typeof ACCOUNT_I18N_KEYS]: Signal<string> };
