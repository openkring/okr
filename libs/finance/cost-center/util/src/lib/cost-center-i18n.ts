import { Signal } from '@angular/core';

const PFX = '@finance/cost-center/feature.';

/** The `i18n` scope of the list's archive-state filter category (items: active, archived). */
export const COST_CENTER_I18N_SCOPE = '@finance/cost-center/feature';

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
  archive_hasChildren:  PFX + 'archiveHasChildren',
  archived:             PFX + 'archived',
  archiveState_active:  PFX + 'archiveState.active.label',
  archiveState_archived: PFX + 'archiveState.archived.label',

  select_search:        PFX + 'select.search',
  select_notFound:      PFX + 'select.notFound',

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
  parentKey_none:       PFX + 'parentKey.none',

  type:                 PFX + 'type.label',
  type_helper:          PFX + 'type.helper',
  type_hasChildren:     PFX + 'type.hasChildren',
  type_root:            PFX + 'type.root',
  type_group:           PFX + 'type.group',
  type_leaf:            PFX + 'type.leaf',

  responsibility:        PFX + 'responsibility.label',
  responsibility_helper: PFX + 'responsibility.helper',
  responsibility_select: PFX + 'responsibility.select',
  responsibility_clear:  PFX + 'responsibility.clear',
  responsibility_none:   PFX + 'responsibility.none',

  notes:                PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',

  migrate_report:       PFX + 'migrate.report',
  migrate_unmatched:    PFX + 'migrate.unmatched',
  migrate_unattributed: PFX + 'migrate.unattributed',
  migrate_more:         PFX + 'migrate.more',
  migrate_refused:      PFX + 'migrate.refused',
  migrate_apply:        PFX + 'migrate.apply',
  migrate_none:         PFX + 'migrate.none',
  migrate_done:         PFX + 'migrate.done',
  migrate_error:        PFX + 'migrate.error',

  as_title:             '@actionsheet.title',
  save:                 '@save.label',
  cancel:               '@cancel',
  ok:                   '@ok',
} satisfies Record<string, string>;

export type CostCenterI18n = { [K in keyof typeof COST_CENTER_I18N_KEYS]: Signal<string> };
