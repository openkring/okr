import { Signal } from '@angular/core';

const PFX = '@games/chess/feature.';

export const CHESS_I18N_KEYS = {
  title:            PFX + 'title',
  board_label:      PFX + 'board_label',
  moves_title:      PFX + 'moves_title',
  square_piece:     PFX + 'square_piece',

  opponent_label:   PFX + 'config.opponent_label',
  opponent_easy:    PFX + 'config.opponent_easy',
  opponent_medium:  PFX + 'config.opponent_medium',
  opponent_hard:    PFX + 'config.opponent_hard',
  opponent_human:   PFX + 'config.opponent_human',
  color_label:      PFX + 'config.color_label',
  color_white:      PFX + 'config.color_white',
  color_black:      PFX + 'config.color_black',
  clock_label:      PFX + 'config.clock_label',
  clock_none:       PFX + 'config.clock_none',
  clock_minutes:    PFX + 'config.clock_minutes',
  autoflip_label:   PFX + 'config.autoflip_label',

  undo:             PFX + 'action.undo',
  hint:             PFX + 'action.hint',
  resign:           PFX + 'action.resign',
  draw:             PFX + 'action.draw',
  restart:          PFX + 'action.restart',

  confirm_restart:  PFX + 'confirm.restart',
  confirm_settings: PFX + 'confirm.settings',
  confirm_resign:   PFX + 'confirm.resign',
  confirm_draw:     PFX + 'confirm.draw',
  confirm_ok:       PFX + 'confirm.ok',
  confirm_cancel:   PFX + 'confirm.cancel',

  white:            PFX + 'player.white',
  black:            PFX + 'player.black',
  you:              PFX + 'player.you',
  computer:         PFX + 'player.computer',

  // those carrying {params} are filled with `fill()` (single braces — translateAll strips {{…}})
  turn_you:         PFX + 'status.turn_you',
  turn_named:       PFX + 'status.turn_named',
  check_you:        PFX + 'status.check_you',
  check_named:      PFX + 'status.check_named',
  thinking:         PFX + 'status.thinking',
  promote:          PFX + 'status.promote',

  win_you:          PFX + 'result.win_you',
  win_computer:     PFX + 'result.win_computer',
  win_named:        PFX + 'result.win_named',
  result_draw:      PFX + 'result.draw',
  checkmate:        PFX + 'result.checkmate',
  stalemate:        PFX + 'result.stalemate',
  repetition:       PFX + 'result.repetition',
  fifty_move:       PFX + 'result.fifty_move',
  insufficient:     PFX + 'result.insufficient',
  timeout:          PFX + 'result.timeout',
  timeout_draw:     PFX + 'result.timeout_draw',
  resigned:         PFX + 'result.resign',
  agreement:        PFX + 'result.agreement',

  note_fallback:    PFX + 'note.fallback',
  note_storage:     PFX + 'note.storage',

  letter_k:         PFX + 'letter.k',
  letter_q:         PFX + 'letter.q',
  letter_r:         PFX + 'letter.r',
  letter_b:         PFX + 'letter.b',
  letter_n:         PFX + 'letter.n',

  piece_k:          PFX + 'piece.k',
  piece_q:          PFX + 'piece.q',
  piece_r:          PFX + 'piece.r',
  piece_b:          PFX + 'piece.b',
  piece_n:          PFX + 'piece.n',
  piece_p:          PFX + 'piece.p',
} satisfies Record<string, string>;

export type ChessI18n = { [K in keyof typeof CHESS_I18N_KEYS]: Signal<string> };
