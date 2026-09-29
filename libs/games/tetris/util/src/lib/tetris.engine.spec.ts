import { describe, expect, it } from 'vitest';

import {
  COLS,
  Cell,
  HIDDEN_ROWS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  PIECE_TYPES,
  ROWS,
  SHAPES,
  TetrisState,
  cellsOf,
  collides,
  createGame,
  dropY,
  gravityMs,
  hardDrop,
  holdPiece,
  levelFor,
  move,
  parseSavedGame,
  rotate,
  shuffledBag,
  softDrop,
  tick,
} from './tetris.engine';

/** A game whose active piece is `type`, on `board` (defaults to empty). */
function withPiece(type: TetrisState['queue'][number], board?: Cell[]): TetrisState {
  const game = createGame(1);
  return { ...game, board: board ?? game.board, active: { type, rot: 0, x: 3, y: HIDDEN_ROWS }, lowestY: HIDDEN_ROWS };
}

/** A board whose bottom `rows` rows are full except column `gap`. */
function wellBoard(rows: number, gap: number): Cell[] {
  const board = Array<Cell>(ROWS * COLS).fill(null);
  for (let y = ROWS - rows; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (x !== gap) board[y * COLS + x] = 'J';
  }
  return board;
}

describe('shapes', () => {
  it('every piece has four cells in every rotation', () => {
    for (const t of PIECE_TYPES) for (const r of SHAPES[t]) expect(r).toHaveLength(4);
  });

  it('rotates I into column 2 of its 4×4 box (SRS state R)', () => {
    expect(SHAPES.I[1].map(([x]) => x)).toEqual([2, 2, 2, 2]);
  });

  it('never changes O', () => {
    expect(SHAPES.O[1]).toEqual(SHAPES.O[0]);
    expect(SHAPES.O[3]).toEqual(SHAPES.O[0]);
  });
});

describe('7-bag', () => {
  it('holds each piece exactly once', () => {
    expect(shuffledBag(42).bag.slice().sort()).toEqual(PIECE_TYPES.slice().sort());
  });

  it('deals every piece once per seven pieces', () => {
    let game = createGame(7);
    const empty = game.board;
    const dealt = [game.active!.type];
    for (let i = 0; i < 13; i++) {
      game = hardDrop({ ...game, board: empty });   // keep the well empty so the game never ends
      dealt.push(game.active!.type);
    }
    expect(dealt.slice(0, 7).sort()).toEqual(PIECE_TYPES.slice().sort());
    expect(dealt.slice(7, 14).sort()).toEqual(PIECE_TYPES.slice().sort());
  });

  it('is reproducible from its seed', () => {
    expect(createGame(99).queue).toEqual(createGame(99).queue);
  });
});

describe('movement', () => {
  it('stops at the wall and returns the same state', () => {
    let game = withPiece('O');
    for (let i = 0; i < 10; i++) game = move(game, -1);
    expect(Math.min(...cellsOf(game.active!).map(([x]) => x))).toBe(0);
    expect(move(game, -1)).toBe(game);
  });

  it('kicks a T off the left wall when rotating', () => {
    let game = withPiece('T');
    game = rotate(game, 1);                      // T pointing right, box column 0 empty
    while (move(game, -1) !== game) game = move(game, -1);
    expect(Math.min(...cellsOf(game.active!).map(([x]) => x))).toBe(0);
    const turned = rotate(game, -1);             // back to spawn state needs a kick right
    expect(turned).not.toBe(game);
    expect(turned.active!.rot).toBe(0);
    expect(collides(turned.board, turned.active!)).toBe(false);
  });

  it('soft drop moves one row and scores one point', () => {
    const game = withPiece('T');
    const next = softDrop(game);
    expect(next.active!.y).toBe(game.active!.y + 1);
    expect(next.score).toBe(game.score + 1);
  });

  it('hard drop scores two points per row and locks', () => {
    const game = withPiece('O');
    const distance = dropY(game.board, game.active!) - game.active!.y;
    const next = hardDrop(game);
    expect(next.score).toBe(2 * distance);
    expect(next.pieces).toBe(1);
    expect(next.board.filter(c => c === 'O')).toHaveLength(4);
  });
});

describe('line clears', () => {
  it('scores a single line times the level', () => {
    // An upright I dropped into the one-cell gap of a single nearly-full row.
    const game = { ...withPiece('I', wellBoard(1, 0)), level: 2 };
    const upright = rotate(game, -1);            // state L: box column 1
    let g = upright;
    while (move(g, -1) !== g) g = move(g, -1);
    const next = hardDrop({ ...g, score: 0 });
    expect(next.lines).toBe(1);
    expect(next.lastClear).toMatchObject({ lines: 1, combo: 0 });
    expect(next.lastClear!.points).toBe(200);
  });

  it('scores four lines as 800 per level, and back-to-back at 1.5×', () => {
    let g = rotate(withPiece('I', wellBoard(4, 0)), -1);
    while (move(g, -1) !== g) g = move(g, -1);
    const first = hardDrop({ ...g, score: 0 });
    expect(first.lastClear!.points).toBe(800);
    expect(first.backToBack).toBe(true);

    let h = rotate({ ...first, board: wellBoard(4, 0), active: { type: 'I', rot: 0, x: 3, y: HIDDEN_ROWS }, lowestY: HIDDEN_ROWS }, -1);
    while (move(h, -1) !== h) h = move(h, -1);
    const second = hardDrop({ ...h, score: 0 });
    expect(second.lastClear!.backToBack).toBe(true);
    expect(second.lastClear!.points).toBe(1200 + 50 * 1);   // + combo 1
  });

  it('leaves no full row behind', () => {
    let g = rotate(withPiece('I', wellBoard(4, 0)), -1);
    while (move(g, -1) !== g) g = move(g, -1);
    const next = hardDrop(g);
    expect(next.board.filter(c => c !== null)).toHaveLength(0);
  });
});

describe('level and gravity', () => {
  it('starts at one second per row', () => {
    expect(gravityMs(1)).toBe(1000);
  });

  it('gets faster with every level', () => {
    for (let l = 2; l <= 20; l++) expect(gravityMs(l)).toBeLessThan(gravityMs(l - 1));
  });

  it('rises every ten lines from the start level', () => {
    expect(levelFor(1, 9)).toBe(1);
    expect(levelFor(1, 10)).toBe(2);
    expect(levelFor(5, 25)).toBe(7);
    expect(levelFor(1, 1000)).toBe(20);
  });

  it('drops one row per gravity interval', () => {
    const game = withPiece('T');
    expect(tick(game, 999).active!.y).toBe(game.active!.y);
    expect(tick(game, 1000).active!.y).toBe(game.active!.y + 1);
  });
});

describe('lock delay', () => {
  const grounded = () => {
    const g = withPiece('O');
    return { ...g, active: { ...g.active!, y: dropY(g.board, g.active!) }, lowestY: dropY(g.board, g.active!) };
  };

  it('waits LOCK_DELAY_MS on the stack before locking', () => {
    const g = grounded();
    expect(tick(g, LOCK_DELAY_MS - 1).pieces).toBe(0);
    expect(tick(tick(g, LOCK_DELAY_MS - 1), 1).pieces).toBe(1);
  });

  it('restarts the delay when the piece moves on the ground', () => {
    const g = tick(grounded(), LOCK_DELAY_MS - 10);
    const shifted = move(g, 1);
    expect(shifted.lockMs).toBe(0);
    expect(shifted.lockResets).toBe(1);
    expect(tick(shifted, LOCK_DELAY_MS - 10).pieces).toBe(0);
  });

  it('locks at once when the move resets are used up', () => {
    const g = { ...grounded(), lockResets: MAX_LOCK_RESETS };
    expect(tick(g, 1).pieces).toBe(1);
  });
});

describe('hold', () => {
  it('parks the piece and takes the next from the queue', () => {
    const game = createGame(3);
    const next = holdPiece(game);
    expect(next.hold).toBe(game.active!.type);
    expect(next.active!.type).toBe(game.queue[0]);
  });

  it('works once per piece', () => {
    const once = holdPiece(createGame(3));
    expect(holdPiece(once)).toBe(once);
    expect(holdPiece(hardDrop(once)).holdUsed).toBe(true);
  });

  it('swaps with the held piece', () => {
    const once = holdPiece(createGame(3));
    const dropped = hardDrop(once);
    const swapped = holdPiece(dropped);
    expect(swapped.active!.type).toBe(once.hold);
    expect(swapped.hold).toBe(dropped.active!.type);
  });
});

describe('game over', () => {
  it('ends when the spawn position is blocked', () => {
    const board = Array<Cell>(ROWS * COLS).fill(null);
    for (let x = 0; x < COLS; x++) if (x !== 9) { board[x] = 'Z'; board[COLS + x] = 'Z'; }
    const game = { ...withPiece('O'), board, active: { type: 'O' as const, rot: 0 as const, x: 7, y: 5 }, lowestY: 5 };
    const next = hardDrop(game);
    expect(next.over).toBe(true);
    expect(next.active).toBeNull();
    expect(move(next, 1)).toBe(next);
    expect(tick(next, 1000)).toBe(next);
  });
});

describe('parseSavedGame', () => {
  it('round-trips a running game', () => {
    const game = softDrop(createGame(5));
    expect(parseSavedGame(JSON.stringify(game))).toEqual(game);
  });

  it('rejects garbage, a finished game and a wrong board size', () => {
    expect(parseSavedGame(null)).toBeNull();
    expect(parseSavedGame('not json')).toBeNull();
    expect(parseSavedGame(JSON.stringify({ ...createGame(5), over: true }))).toBeNull();
    expect(parseSavedGame(JSON.stringify({ ...createGame(5), board: [] }))).toBeNull();
  });
});
