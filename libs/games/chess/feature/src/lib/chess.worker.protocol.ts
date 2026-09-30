import type { Level } from '@okr/games-chess-util';

/** store → worker: search `fen` for `budgetMs` and answer with a UCI move. */
export interface ChessWorkerRequest {
  id: number;
  fen: string;
  /** positionKey() of every earlier position of the game (repetition rule). */
  history: string[];
  level: Level;
  budgetMs: number;
}

/** worker → store. `move` is UCI (`e2e4`, `e7e8q`), null when there is no legal move. */
export interface ChessWorkerReply {
  id: number;
  move: string | null;
  error?: string;
}
