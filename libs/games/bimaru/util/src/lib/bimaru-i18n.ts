import { Signal } from '@angular/core';

const PFX = '@games/bimaru/feature.';

export const BIMARU_I18N_KEYS = {
  title:             PFX + 'title',
  desc:              PFX + 'desc',

  // the size select
  size_label:        PFX + 'option.size_label',
  size_small:        PFX + 'option.size_small',
  size_medium:       PFX + 'option.size_medium',
  size_large:        PFX + 'option.size_large',

  // buttons
  undo:              PFX + 'action.undo',
  hint:              PFX + 'action.hint',
  check:             PFX + 'action.check',
  new_game:          PFX + 'action.new_game',

  // the fleet list under the board
  fleet:             PFX + 'board.fleet',
  ship_4:            PFX + 'ship.4',
  ship_3:            PFX + 'ship.3',
  ship_2:            PFX + 'ship.2',
  ship_1:            PFX + 'ship.1',

  // screen-reader labels; those carrying {params} are filled with `fill()`
  cell_unknown:      PFX + 'cell.unknown',
  cell_water:        PFX + 'cell.water',
  cell_ship:         PFX + 'cell.ship',
  count_row:         PFX + 'cell.count_row',
  count_col:         PFX + 'cell.count_col',

  // the status line
  status_play:       PFX + 'status.play',
  status_errors:     PFX + 'status.errors',
  status_error_one:  PFX + 'status.error_one',
  status_no_errors:  PFX + 'status.no_errors',
  status_hint:       PFX + 'status.hint',
  status_no_hint:    PFX + 'status.no_hint',
  status_solved:     PFX + 'status.solved',
  status_solved_hints: PFX + 'status.solved_hints',
} satisfies Record<string, string>;

export type BimaruI18n = { [K in keyof typeof BIMARU_I18N_KEYS]: Signal<string> };
