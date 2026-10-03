import { Signal } from '@angular/core';

const PFX = '@games/sudoku/feature.';

export const SUDOKU_I18N_KEYS = {
  title:             PFX + 'title',
  desc:              PFX + 'desc',

  // the difficulty select
  difficulty_label:  PFX + 'option.difficulty_label',
  difficulty_easy:   PFX + 'option.difficulty_easy',
  difficulty_medium: PFX + 'option.difficulty_medium',
  difficulty_hard:   PFX + 'option.difficulty_hard',

  // buttons
  undo:              PFX + 'action.undo',
  hint:              PFX + 'action.hint',
  check:             PFX + 'action.check',
  new_game:          PFX + 'action.new_game',
  erase:             PFX + 'action.erase',
  notes:             PFX + 'action.notes',

  // screen-reader labels; those carrying {params} are filled with `fill()`
  cell_empty:        PFX + 'cell.empty',
  cell_label:        PFX + 'cell.label',
  cell_notes:        PFX + 'cell.notes',
  digit_label:       PFX + 'cell.digit',

  // the status line
  status_play:       PFX + 'status.play',
  status_select:     PFX + 'status.select',
  status_errors:     PFX + 'status.errors',
  status_error_one:  PFX + 'status.error_one',
  status_no_errors:  PFX + 'status.no_errors',
  status_hint:       PFX + 'status.hint',
  status_no_hint:    PFX + 'status.no_hint',
  status_solved:     PFX + 'status.solved',
  status_solved_hints: PFX + 'status.solved_hints',
} satisfies Record<string, string>;

export type SudokuI18n = { [K in keyof typeof SUDOKU_I18N_KEYS]: Signal<string> };
