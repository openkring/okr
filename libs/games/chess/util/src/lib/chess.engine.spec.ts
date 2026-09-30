import { describe, expect, it } from 'vitest';
import { applyMove, inCheck, legalMoves, perft } from './chess.engine';
import { parseFen } from './chess.fen';
import { Move, START_FEN, squareName } from './chess.types';

const uci = (m: Move) => squareName(m.from) + squareName(m.to) + (m.promotion ?? '');
const ucis = (fen: string) => legalMoves(parseFen(fen)).map(uci);

// Reference counts: Chess Programming Wiki, "Perft Results" (re-check there if one fails).
// Debug a mismatch by comparing per-root-move counts ("divide") with the wiki's tables.
const PERFT: [string, string, number[]][] = [
  ['start', START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];

describe('perft', () => {
  for (const [name, fen, counts] of PERFT) {
    counts.forEach((expected, i) => {
      it(`${name} depth ${i + 1} = ${expected}`, { timeout: 60_000 }, () => {
        expect(perft(parseFen(fen), i + 1)).toBe(expected);
      });
    });
  }
});

describe('castling', () => {
  it('castles both ways when nothing is in the way', () => {
    expect(ucis('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toEqual(expect.arrayContaining(['e1g1', 'e1c1']));
  });

  it('never castles out of check', () => {
    const moves = ucis('4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(moves).not.toContain('e1g1');
    expect(moves).not.toContain('e1c1');
  });

  it('never castles through an attacked square', () => {
    const moves = ucis('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(moves).not.toContain('e1g1');
    expect(moves).toContain('e1c1');
  });

  it('never castles into check', () => {
    const moves = ucis('4k1r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(moves).not.toContain('e1g1');
    expect(moves).toContain('e1c1');
  });

  it('may castle long while only b1 is attacked', () => {
    expect(ucis('1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1')).toContain('e1c1');
  });

  it('moves the rook along', () => {
    const pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const move = legalMoves(pos).find(m => uci(m) === 'e1g1')!;
    const next = applyMove(pos, move);
    expect(next.board[62]).toBe('K');
    expect(next.board[61]).toBe('R');
    expect(next.board[63]).toBeNull();
    expect(next.castling).toEqual({ K: false, Q: false, k: true, q: true });
  });

  it('loses the right when the rook is captured at home', () => {
    const pos = parseFen('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1');
    const move = legalMoves(pos).find(m => uci(m) === 'g2h1')!;
    expect(applyMove(pos, move).castling.K).toBe(false);
  });
});

describe('en passant', () => {
  it('captures the pawn beside, not on the target square', () => {
    const pos = parseFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const move = legalMoves(pos).find(m => uci(m) === 'e5d6')!;
    expect(move.kind).toBe('ep');
    const next = applyMove(pos, move);
    expect(next.board[19]).toBe('P'); // d6
    expect(next.board[27]).toBeNull(); // d5
    expect(next.halfmove).toBe(0);
  });

  it('is illegal when it exposes the own king along the rank', () => {
    expect(ucis('8/8/8/KPp4r/8/8/8/7k w - c6 0 1')).not.toContain('b5c6');
  });

  it('sets the en-passant square only after a double step', () => {
    const pos = parseFen(START_FEN);
    const e4 = legalMoves(pos).find(m => uci(m) === 'e2e4')!;
    expect(applyMove(pos, e4).ep).toBe(44); // e3
    const e3 = legalMoves(pos).find(m => uci(m) === 'e2e3')!;
    expect(applyMove(pos, e3).ep).toBeNull();
  });
});

describe('promotion', () => {
  it('offers all four pieces', () => {
    expect(ucis('8/P7/8/8/8/8/8/k6K w - - 0 1').filter(u => u.startsWith('a7a8')).sort())
      .toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
  });

  it('offers all four pieces on a capture, too', () => {
    expect(ucis('1r5k/P7/8/8/8/8/8/7K w - - 0 1').filter(u => u.startsWith('a7b8')).sort())
      .toEqual(['a7b8b', 'a7b8n', 'a7b8q', 'a7b8r']);
  });

  it('puts the chosen piece on the board', () => {
    const pos = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const move = legalMoves(pos).find(m => uci(m) === 'a7a8n')!;
    expect(applyMove(pos, move).board[0]).toBe('N');
  });
});

describe('check', () => {
  it('detects check and only allows answers to it', () => {
    const pos = parseFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
    expect(inCheck(pos)).toBe(true);
    expect(ucis('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1').sort()).toEqual(['e1d1', 'e1e2', 'e1f1']);
  });

  it('counts the clocks', () => {
    const pos = parseFen(START_FEN);
    const nf3 = legalMoves(pos).find(m => uci(m) === 'g1f3')!;
    const a = applyMove(pos, nf3);
    expect([a.halfmove, a.fullmove, a.turn]).toEqual([1, 1, 'b']);
    const nf6 = legalMoves(a).find(m => uci(m) === 'g8f6')!;
    const b = applyMove(a, nf6);
    expect([b.halfmove, b.fullmove, b.turn]).toEqual([2, 2, 'w']);
  });
});
