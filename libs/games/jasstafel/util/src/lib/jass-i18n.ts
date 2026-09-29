import { Signal } from '@angular/core';

const PFX = '@games/jasstafel/feature.';

export const JASS_I18N_KEYS = {
  title:              PFX + 'title',
  storage_note:       PFX + 'storage_note',

  // start screen
  variant_label:      PFX + 'setup.variant_label',
  variant_schieber:   PFX + 'setup.variant_schieber',
  variant_bueter:     PFX + 'setup.variant_bueter',
  variant_coiffeur:   PFX + 'setup.variant_coiffeur',
  variant_differenzler: PFX + 'setup.variant_differenzler',
  seat:               PFX + 'setup.seat',
  seat_empty:         PFX + 'setup.seat_empty',
  team:               PFX + 'setup.team',
  bueter_label:       PFX + 'setup.bueter_label',
  players_count:      PFX + 'setup.players_count',
  start:              PFX + 'setup.start',
  duplicate_player:   PFX + 'setup.duplicate_player',

  // slate
  trump_maker:        PFX + 'slate.trump_maker',
  target:             PFX + 'slate.target',
  hand_no:            PFX + 'slate.hand_no',
  sum:                PFX + 'slate.sum',
  enter_hand:         PFX + 'action.enter_hand',
  enter_announce:     PFX + 'action.enter_announce',
  undo:               PFX + 'action.undo',
  history:            PFX + 'action.history',
  end_game:           PFX + 'action.end_game',
  end_confirm:        PFX + 'action.end_confirm',
  new_game:           PFX + 'action.new_game',
  done:               PFX + 'action.done',
  ok:                 PFX + 'action.ok',
  cancel:             PFX + 'action.cancel',
  delete_hand:        PFX + 'action.delete_hand',
  edit_hand:          PFX + 'action.edit_hand',
  clear_archive:      PFX + 'action.clear_archive',


  // hand form
  hand_title:         PFX + 'hand.title',
  announce_title:     PFX + 'hand.announce_title',
  trump_label:        PFX + 'hand.trump_label',
  multiplier_label:   PFX + 'hand.multiplier_label',
  side_label:         PFX + 'hand.side_label',
  points_label:       PFX + 'hand.points_label',
  points_helper:      PFX + 'hand.points_helper',
  weis_label:         PFX + 'hand.weis_label',
  weis_helper:        PFX + 'hand.weis_helper',
  match_label:        PFX + 'hand.match_label',
  none:               PFX + 'hand.none',
  announced_label:    PFX + 'hand.announced_label',
  preview:            PFX + 'hand.preview',

  // settings form
  schieber_target:    PFX + 'settings.schieber_target',
  bueter_target:      PFX + 'settings.bueter_target',
  bid_label:          PFX + 'settings.bid_label',
  differenzler_hands: PFX + 'settings.differenzler_hands',
  rows_title:         PFX + 'settings.rows_title',
  row_label:          PFX + 'settings.row_label',
  row_multiplier:     PFX + 'settings.row_multiplier',
  rows_helper:        PFX + 'settings.rows_helper',

  // result + stats
  winner:             PFX + 'result.winner',
  stat_date:          PFX + 'result.stat_date',
  stat_start:         PFX + 'result.stat_start',
  stat_duration:      PFX + 'result.stat_duration',
  draw:               PFX + 'result.draw',
  stat_points:        PFX + 'result.stat_points',
  stat_weis:          PFX + 'result.stat_weis',
  stat_matches:       PFX + 'result.stat_matches',
  stat_average:       PFX + 'result.stat_average',

  // history
  history_title:      PFX + 'history.title',
  history_hands:      PFX + 'history.hands',
  history_finished:   PFX + 'history.finished',
  history_empty:      PFX + 'history.empty',

  // validation messages
  error_trump:        PFX + 'error.trump',
  error_multiplier:   PFX + 'error.multiplier',
  error_points_sum:   PFX + 'error.points_sum',
  error_weis:         PFX + 'error.weis',
  error_side:         PFX + 'error.side',
  error_announce:     PFX + 'error.announce',
  error_target:       PFX + 'error.target',
  error_bid:          PFX + 'error.bid',
  error_hands:        PFX + 'error.hands',
  error_rows:         PFX + 'error.rows',

  // change confirmation
  changeConfirmation_ok:     PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel: PFX + 'changeConfirmation.cancel',
} satisfies Record<string, string>;

export type JassI18n = { [K in keyof typeof JASS_I18N_KEYS]: Signal<string> };
