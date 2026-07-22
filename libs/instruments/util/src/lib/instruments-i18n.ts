import { Signal } from '@angular/core';

const PFX = '@instruments/feature.';

/** Feature-level i18n keys for the instruments board (list, board page, topic editor). */
export const INSTRUMENTS_I18N_KEYS = {
  instrument:                 PFX + 'instrument',
  instruments:                PFX + 'instruments',
  plural:                     PFX + 'plural',
  desc:                       PFX + 'desc',
  empty:                      PFX + 'empty',

  // instrument types (also the list partitions)
  type_swot:                  PFX + 'type.swot',
  type_pestel:                PFX + 'type.pestel',
  type_bmc:                   PFX + 'type.bmc',
  type_eisenhower:            PFX + 'type.eisenhower',

  create:                     PFX + 'create.label',
  create_conf:                PFX + 'create.conf',
  create_error:               PFX + 'create.error',
  update:                     PFX + 'update.label',
  update_conf:                PFX + 'update.conf',
  update_error:               PFX + 'update.error',
  delete:                     PFX + 'delete.label',
  delete_confirm:             PFX + 'delete.confirm',
  delete_conf:                PFX + 'delete.conf',
  delete_error:               PFX + 'delete.error',
  view:                       PFX + 'view.label',

  as_title:                   '@actionsheet.title',
  cancel:                     '@cancel',
  ok:                         '@ok',
  save:                       '@save.label',
  done:                       PFX + 'done',

  // board
  board_empty_cell:           PFX + 'board.emptyCell',
  add_topic:                  PFX + 'board.addTopic',

  // instrument fields
  name_label:                 PFX + 'name.label',
  name_placeholder:           PFX + 'name.placeholder',
  name_helper:                PFX + 'name.helper',
  description_label:          PFX + 'description.label',
  description_placeholder:    PFX + 'description.placeholder',

  // topic (card) fields
  topicLabel_label:           PFX + 'topic.label.label',
  topicLabel_placeholder:     PFX + 'topic.label.placeholder',
  topicLabel_helper:          PFX + 'topic.label.helper',
  topicDescription_label:     PFX + 'topic.description.label',
  topicDescription_placeholder: PFX + 'topic.description.placeholder',
  topicImpact_label:          PFX + 'topic.impact.label',
  topicHorizon_label:         PFX + 'topic.horizon.label',
  topicColor_label:           PFX + 'topic.color.label',

  score_low:                  PFX + 'score.low',
  score_medium:               PFX + 'score.medium',
  score_high:                 PFX + 'score.high',
  score_unset:                PFX + 'score.unset',
  horizon_short:              PFX + 'horizon.short',
  horizon_medium:             PFX + 'horizon.medium',
  horizon_long:               PFX + 'horizon.long',
} satisfies Record<string, string>;

export type InstrumentI18n = { [K in keyof typeof INSTRUMENTS_I18N_KEYS]: Signal<string> };

/**
 * Every grid cell label across the four canonical grids, keyed by `GridCell.id`. Cell ids are unique
 * across all four grids, so one batched `translateAll(CELL_I18N_KEYS)` resolves every label; the
 * board picks the subset for the instrument's grid. Keys match `grid-definitions.ts` exactly.
 */
export const CELL_I18N_KEYS = {
  // SWOT
  strengths:              '@instruments/feature.cell.strengths',
  weaknesses:             '@instruments/feature.cell.weaknesses',
  opportunities:          '@instruments/feature.cell.opportunities',
  threats:                '@instruments/feature.cell.threats',
  // Eisenhower
  do:                     '@instruments/feature.cell.do',
  schedule:               '@instruments/feature.cell.schedule',
  delegate:               '@instruments/feature.cell.delegate',
  delete:                 '@instruments/feature.cell.delete',
  // PESTEL
  political:              '@instruments/feature.cell.political',
  economic:               '@instruments/feature.cell.economic',
  social:                 '@instruments/feature.cell.social',
  technological:          '@instruments/feature.cell.technological',
  environmental:          '@instruments/feature.cell.environmental',
  legal:                  '@instruments/feature.cell.legal',
  // BMC
  keyPartners:            '@instruments/feature.cell.keyPartners',
  keyActivities:          '@instruments/feature.cell.keyActivities',
  keyResources:           '@instruments/feature.cell.keyResources',
  valuePropositions:      '@instruments/feature.cell.valuePropositions',
  customerRelationships:  '@instruments/feature.cell.customerRelationships',
  channels:               '@instruments/feature.cell.channels',
  customerSegments:       '@instruments/feature.cell.customerSegments',
  costStructure:          '@instruments/feature.cell.costStructure',
  revenueStreams:         '@instruments/feature.cell.revenueStreams',
} satisfies Record<string, string>;

export type CellI18n = { [K in keyof typeof CELL_I18N_KEYS]: Signal<string> };
