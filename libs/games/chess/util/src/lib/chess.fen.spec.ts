import { describe, expect, it } from 'vitest';
import { FenError, parseFen, positionKey, toFen } from './chess.fen';
import { START_FEN } from './chess.types';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const EP_POSSIBLE = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
const EP_IMPOSSIBLE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('parseFen / toFen', () => {
  it('reads the start position', () => {
    const pos = parseFen(START_FEN);
    expect(pos.board[0]).toBe('r');
    expect(pos.board[60]).toBe('K');
    expect(pos.board[36]).toBeNull();
    expect(pos.turn).toBe('w');
    expect(pos.castling).toEqual({ K: true, Q: true, k: true, q: true });
    expect(pos.ep).toBeNull();
    expect(pos.halfmove).toBe(0);
    expect(pos.fullmove).toBe(1);
  });

  it.each([START_FEN, KIWIPETE, EP_POSSIBLE, '8/8/8/4k3/8/8/8/4K3 b - - 12 40'])('round-trips %s', fen => {
    expect(toFen(parseFen(fen))).toBe(fen);
  });

  it('defaults the move counters of a 4-field FEN', () => {
    expect(toFen(parseFen('8/8/8/4k3/8/8/8/4K3 w - -'))).toBe('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
  });

  it.each([
    ['garbage', 'invalid'],
    ['no kings', '8/8/8/8/8/8/8/8 w - - 0 1'],
    ['short rank', 'rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['bad side', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'],
    ['bad castling', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w X - 0 1'],
    ['bad ep', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq z9 0 1'],
    ['bad counters', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - x 1'],
  ])('rejects %s', (_, fen) => {
    expect(() => parseFen(fen)).toThrow(FenError);
  });
});

describe('positionKey', () => {
  it('drops the clocks', () => {
    expect(positionKey(parseFen('8/8/8/4k3/8/8/8/4K3 w - - 3 9')))
      .toBe(positionKey(parseFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1')));
  });

  it('keeps the en-passant square only when a capture is possible', () => {
    expect(positionKey(parseFen(EP_POSSIBLE)).endsWith(' d6')).toBe(true);
    expect(positionKey(parseFen(EP_IMPOSSIBLE)).endsWith(' -')).toBe(true);
  });
});
