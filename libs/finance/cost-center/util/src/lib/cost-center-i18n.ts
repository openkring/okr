import { Signal } from '@angular/core';

const PFX = '@finance/cost-center/feature.';

export const COST_CENTER_I18N_KEYS = {
  costCenters:          PFX + 'costCenters',
  empty:                PFX + 'empty',
  none:                 PFX + 'none',
  picker:               PFX + 'picker',

  create:               PFX + 'create',
  update:               PFX + 'update',
  view:                 PFX + 'view',
  archive:              PFX + 'archive',
  archive_conf:         PFX + 'archiveConf',

  id:                   PFX + 'id.label',
  id_placeholder:       PFX + 'id.placeholder',
  id_helper:            PFX + 'id.helper',
  id_duplicate:         PFX + 'id.duplicate',

  name:                 PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',

  parentKey:            PFX + 'parentKey.label',
  parentKey_helper:     PFX + 'parentKey.helper',
  parentKey_cycle:      PFX + 'parentKey.cycle',
  parentKey_notGroup:   PFX + 'parentKey.notGroup',

  type:                 PFX + 'type.label',
  type_helper:          PFX + 'type.helper',
  type_hasChildren:     PFX + 'type.hasChildren',
  type_root:            PFX + 'type.root',
  type_group:           PFX + 'type.group',
  type_leaf:            PFX + 'type.leaf',

  responsibility:        PFX + 'responsibility.label',
  responsibility_helper: PFX + 'responsibility.helper',

  notes:                PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',

  as_title:             '@actionsheet.title',
  save:                 '@save.label',
  cancel:               '@cancel',
  ok:                   '@ok',
} satisfies Record<string, string>;

export type CostCenterI18n = { [K in keyof typeof COST_CENTER_I18N_KEYS]: Signal<string> };
