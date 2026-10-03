import { Signal } from '@angular/core';

const PFX = '@games/backgammon/feature.';

export const BACKGAMMON_I18N_KEYS = {
  title:             PFX + 'title',
  board_label:       PFX + 'board_label',

  // the two selects
  opponent_label:    PFX + 'config.opponent_label',
  opponent_easy:     PFX + 'config.opponent_easy',
  opponent_medium:   PFX + 'config.opponent_medium',
  opponent_hard:     PFX + 'config.opponent_hard',
  opponent_human:    PFX + 'config.opponent_human',
  color_label:       PFX + 'config.color_label',
  color_white:       PFX + 'config.color_white',
  color_black:       PFX + 'config.color_black',

  // the footer buttons
  roll:              PFX + 'action.roll',
  end_turn:          PFX + 'action.end_turn',
  undo:              PFX + 'action.undo',
  restart:           PFX + 'action.restart',

  // the two player cards; those carrying {params} are filled with `fill()`
  white:             PFX + 'player.white',
  black:             PFX + 'player.black',
  who_you:           PFX + 'player.you',
  who_computer:      PFX + 'player.computer',
  who_player:        PFX + 'player.player',
  tray_meta:         PFX + 'player.tray_meta',
  tray_score:        PFX + 'player.tray_score',

  // the board, for screen readers and the notation
  point_label:       PFX + 'board.point',
  bar_label:         PFX + 'board.bar',
  off_label:         PFX + 'board.off',
  notation_bar:      PFX + 'board.notation_bar',
  notation_off:      PFX + 'board.notation_off',

  // the status line and the line below it
  status_you:        PFX + 'status.you',
  status_roll:       PFX + 'status.roll',
  status_select:     PFX + 'status.select',
  status_select_bar: PFX + 'status.select_bar',
  status_target:     PFX + 'status.target',
  status_done:       PFX + 'status.done',
  status_blocked:    PFX + 'status.blocked',
  status_blocked_rest: PFX + 'status.blocked_rest',
  status_thinking:   PFX + 'status.thinking',
  status_win_you:    PFX + 'status.win_you',
  status_win_computer: PFX + 'status.win_computer',
  status_win_named:  PFX + 'status.win_named',
  kind_single:       PFX + 'status.kind_single',
  kind_gammon:       PFX + 'status.kind_gammon',
  kind_backgammon:   PFX + 'status.kind_backgammon',
  info_opening:      PFX + 'status.info_opening',
  info_last:         PFX + 'status.info_last',
  info_none:         PFX + 'status.info_none',

  // the rules
  rules_title:       PFX + 'rules.title',
  rules_goal:        PFX + 'rules.goal',
  rules_move:        PFX + 'rules.move',
  rules_hit:         PFX + 'rules.hit',
  rules_must:        PFX + 'rules.must',
  rules_bear:        PFX + 'rules.bear',
  rules_score:       PFX + 'rules.score',
} satisfies Record<string, string>;

export type BackgammonI18n = { [K in keyof typeof BACKGAMMON_I18N_KEYS]: Signal<string> };
