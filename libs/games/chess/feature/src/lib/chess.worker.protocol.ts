/** Computer strength; re-exported from `@okr/games-chess-util` once Task 7 adds it there. */
export type WorkerLevel = 'easy' | 'medium' | 'hard';

/** store → worker: search `fen` for `budgetMs` and answer with a UCI move. */
export interface ChessWorkerRequest {
  id: number;
  fen: string;
  /** positionKey() of every earlier position of the game (repetition rule). */
  history: string[];
  level: WorkerLevel;
  budgetMs: number;
}

/** worker → store. `move` is UCI (`e2e4`, `e7e8q`), null when there is no legal move. */
export interface ChessWorkerReply {
  id: number;
  move: string | null;
  error?: string;
}
