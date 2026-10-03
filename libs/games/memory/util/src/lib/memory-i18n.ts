import { Signal } from '@angular/core';

const PFX = '@games/memory/feature.';

export const MEMORY_I18N_KEYS = {
  title:             PFX + 'title',
  desc:              PFX + 'desc',

  // the settings
  size_label:        PFX + 'option.size_label',
  size_small:        PFX + 'option.size_small',
  size_medium:       PFX + 'option.size_medium',
  size_large:        PFX + 'option.size_large',
  theme_label:       PFX + 'option.theme_label',
  theme_animals:     PFX + 'option.theme_animals',
  theme_food:        PFX + 'option.theme_food',
  theme_sport:       PFX + 'option.theme_sport',
  players_label:     PFX + 'option.players_label',
  players_one:       PFX + 'option.players_one',
  players_two:       PFX + 'option.players_two',

  // buttons
  new_game:          PFX + 'action.new_game',

  // the score line; those carrying {params} are filled with `fill()`
  moves:             PFX + 'score.moves',
  best:              PFX + 'score.best',
  player:            PFX + 'score.player',

  // screen-reader labels
  card_hidden:       PFX + 'card.hidden',
  card_open:         PFX + 'card.open',

  // the status line
  status_play:       PFX + 'status.play',
  status_turn:       PFX + 'status.turn',
  status_match:      PFX + 'status.match',
  status_match_again: PFX + 'status.match_again',
  status_solved:     PFX + 'status.solved',
  status_solved_best: PFX + 'status.solved_best',
  status_winner:     PFX + 'status.winner',
  status_draw:       PFX + 'status.draw',
} satisfies Record<string, string>;

export type MemoryI18n = { [K in keyof typeof MEMORY_I18N_KEYS]: Signal<string> };
