import { Signal } from '@angular/core';

const PFX = '@games/zip/feature.';

export const ZIP_I18N_KEYS = {
  title:             PFX + 'title',
  desc:              PFX + 'desc',

  // the two controls in the toolbar
  size_label:        PFX + 'config.size_label',
  count_label:       PFX + 'config.count_label',

  // the footer buttons
  undo:              PFX + 'action.undo',
  hint:              PFX + 'action.hint',
  restart:           PFX + 'action.restart',

  // running state; those carrying {params} are filled with `fill()`
  progress:          PFX + 'status.progress',
  hints_used:        PFX + 'status.hints_used',
  time_label:        PFX + 'status.time_label',
  solved:            PFX + 'status.solved',
  solved_time:       PFX + 'status.solved_time',
  solved_hints:      PFX + 'status.solved_hints',
  solved_no_hints:   PFX + 'status.solved_no_hints',

  // why a move was refused
  blocked_visited:   PFX + 'blocked.visited',
  blocked_adjacent:  PFX + 'blocked.adjacent',
  blocked_order:     PFX + 'blocked.order',
  blocked_finished:  PFX + 'blocked.finished',
} satisfies Record<string, string>;

export type ZipI18n = { [K in keyof typeof ZIP_I18N_KEYS]: Signal<string> };
