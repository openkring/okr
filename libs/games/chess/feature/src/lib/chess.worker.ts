import { chooseMove, parseFen, toUci } from '@okr/games-chess-util';

import type { ChessWorkerReply, ChessWorkerRequest } from './chess.worker.protocol';

/**
 * The computer's search, off the main thread. One request at a time; the store drops answers
 * whose `id` it no longer waits for, and terminates the worker to cancel a running search.
 */
addEventListener('message', (event: MessageEvent<ChessWorkerRequest>) => {
  const { id, fen, history, level, budgetMs } = event.data;
  let reply: ChessWorkerReply;
  try {
    const move = chooseMove(parseFen(fen), { level, budgetMs, history });
    reply = { id, move: move ? toUci(move) : null };
  } catch (e) {
    reply = { id, move: null, error: e instanceof Error ? e.message : String(e) };
  }
  postMessage(reply);
});
