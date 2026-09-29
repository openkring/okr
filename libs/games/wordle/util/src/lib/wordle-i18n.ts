import { Signal } from '@angular/core';

const PFX = '@games/wordle/feature.';

export const WORDLE_I18N_KEYS = {
  title:            PFX + 'title',
  desc:             PFX + 'desc',

  // the controls above the board
  mode_label:       PFX + 'config.mode_label',
  mode_daily:       PFX + 'config.mode_daily',
  mode_endless:     PFX + 'config.mode_endless',
  length_label:     PFX + 'config.length_label',
  tries_label:      PFX + 'config.tries_label',
  tries_next:       PFX + 'config.tries_next',

  // keyboard and buttons
  enter:            PFX + 'action.enter',
  backspace:        PFX + 'action.backspace',
  next_word:        PFX + 'action.next_word',
  share:            PFX + 'action.share',

  // round state; those carrying {params} are filled with `fill()`
  too_short:        PFX + 'status.too_short',
  won:              PFX + 'status.won',
  won_detail:       PFX + 'status.won_detail',
  lost:             PFX + 'status.lost',
  lost_detail:      PFX + 'status.lost_detail',
  daily_done:       PFX + 'status.daily_done',
  copied:           PFX + 'status.copied',
  share_daily:      PFX + 'status.share_daily',
  share_endless:    PFX + 'status.share_endless',

  // statistics of the current mode and length
  stats_title:      PFX + 'stats.title',
  stats_played:     PFX + 'stats.played',
  stats_winrate:    PFX + 'stats.winrate',
  stats_streak:     PFX + 'stats.streak',
  stats_max_streak: PFX + 'stats.max_streak',
  stats_dist:       PFX + 'stats.dist',
} satisfies Record<string, string>;

export type WordleI18n = { [K in keyof typeof WORDLE_I18N_KEYS]: Signal<string> };
