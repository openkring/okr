import { Signal } from '@angular/core';

const PFX = '@games/battleship/feature.';

export const BATTLESHIP_I18N_KEYS = {
  title:             PFX + 'title',

  // setup options
  opt_allow_touch:   PFX + 'option.allow_touch',
  opt_extra_shot:    PFX + 'option.extra_shot',
  level_label:       PFX + 'option.level_label',
  level_easy:        PFX + 'option.level_easy',
  level_normal:      PFX + 'option.level_normal',
  level_hard:        PFX + 'option.level_hard',

  // buttons
  rotate:            PFX + 'action.rotate',
  random:            PFX + 'action.random',
  reset:             PFX + 'action.reset',
  start:             PFX + 'action.start',
  again:             PFX + 'action.again',

  // the two boards
  own_fleet:         PFX + 'board.own',
  enemy_fleet:       PFX + 'board.enemy',

  // ship names, one per `ShipId`
  ship_carrier:      PFX + 'ship.carrier',
  ship_battleship:   PFX + 'ship.battleship',
  ship_cruiser:      PFX + 'ship.cruiser',
  ship_submarine:    PFX + 'ship.submarine',
  ship_destroyer:    PFX + 'ship.destroyer',

  // the status line; those carrying {params} are filled with `fill()`
  status_place:      PFX + 'status.place',
  status_ready:      PFX + 'status.ready',
  status_no_fit:     PFX + 'status.no_fit',
  status_no_fit_touch: PFX + 'status.no_fit_touch',
  status_your_turn:  PFX + 'status.your_turn',
  status_you:        PFX + 'status.you',
  status_enemy:      PFX + 'status.enemy',
  status_miss:       PFX + 'status.miss',
  status_hit:        PFX + 'status.hit',
  status_sunk:       PFX + 'status.sunk',
  status_again:      PFX + 'status.again',
  status_enemy_aims: PFX + 'status.enemy_aims',
  status_enemy_again: PFX + 'status.enemy_again',
  status_your_turn_short: PFX + 'status.your_turn_short',
  status_won:        PFX + 'status.won',
  status_lost:       PFX + 'status.lost',
} satisfies Record<string, string>;

export type BattleshipI18n = { [K in keyof typeof BATTLESHIP_I18N_KEYS]: Signal<string> };
