import type { ChessWorkerReply, ChessWorkerRequest } from './chess.worker.protocol';

// TEMPORARY (Task 2): proves bundling and messaging; Task 11 replaces the body with the search.
addEventListener('message', (event: MessageEvent<ChessWorkerRequest>) => {
  const reply: ChessWorkerReply = { id: event.data.id, move: null };
  postMessage(reply);
});
