# Zip Domain

## Overview

Zip is a self-contained, client-side path puzzle with no Firestore persistence: connect the
numbered cells in ascending order with a single continuous path that fills every cell of the
board exactly once. The board size (3-6) and the number of checkpoints (4-10) are chosen by the
player in the page toolbar; each change deals a fresh board.

The domain is split into two libs:

- `@okr/games-zip-util` — pure logic, no Angular runtime: board generation, move rules, hint,
  config validation, i18n keys. Fully unit-tested.
- `@okr/games-zip-feature` — `ZipPage` + `ZipStore` and the five translation bundles.

## No Firestore Collection

Game state is entirely in memory and lives as long as the page does. There is no service, no
collection and no `*Collection` constant in `@okr/shared-models`. An unfinished board is lost on
navigation, by design.

## Data Types

### ZipCell

| Field | Type | Description |
|---|---|---|
| `row` | number | Zero-based row, growing downwards |
| `col` | number | Zero-based column, growing right |

### ZipPuzzle

| Field | Type | Description |
|---|---|---|
| `size` | number | Edge length of the square board (3-6) |
| `checkpoints` | `ZipCell[]` | The numbered cells, ascending; index + 1 is the number shown |
| `solution` | `ZipCell[]` | A Hamiltonian path over the whole board; backs the hint only |

### ZipConfig

| Field | Type | Description |
|---|---|---|
| `size` | number | Board edge, clamped to `ZIP_MIN_SIZE`..`ZIP_MAX_SIZE` (3..6) |
| `count` | number | Checkpoints, clamped to 4..10 and then to at most `size * size` |

## Generation

`generateZipPuzzle(config, random?)` is solvable **by construction** rather than by checking
afterwards:

1. `generateHamiltonianPath` draws a random path covering every cell — randomised depth-first
   search with backtracking, where each candidate step is pruned by a flood fill that requires
   all still-unvisited cells to remain reachable. Without that prune the search strands cells and
   blows up; with it a 6x6 board resolves in a few thousand steps.
2. `pickCheckpoints` places the numbers on cells of that path, in the order the path visits them.
   The first and last cell of the path always carry a number; the rest are spread evenly with a
   one-cell jitter, each index forced above its predecessor.

Walking `solution` in order therefore always satisfies both rules of the game. A player may still
solve the board along a different path — `isSolved` judges the board, not the stored solution.

## Rules (`zip.rules.ts`)

- `judgeMove(path, cell, puzzle)` returns a `ZipMoveVerdict`: `'ok'`, `'off-board'`,
  `'not-adjacent'`, `'already-visited'`, `'out-of-order'` (a number that is not the next one due)
  or `'finished'` (the path already rests on the last number, so nothing may extend it).
- `isSolved(path, puzzle)` — every cell used once, every number collected, path ending on the
  last number.
- `isBacktrack(path, cell)` — the pointer moved back onto the cell the path came from; the board
  rubs out the last step instead of drawing a new one.
- `applyHint(path, puzzle)` — rewinds the path to its longest common prefix with `solution`, then
  appends one cell. A player who wandered off gets the wrong moves taken back, since a diverged
  path cannot be continued into the solution.

## ZipStore

NgRx Signal Store, provided on the component (`providers: [ZipStore]`) — deliberately not rooted,
so two boards never share state. Methods:

- `newGame(config?)` — deals a fresh board; `setSize(size)` / `setCount(count)` clamp and re-deal.
- `extend(cell)` — plays one step, rubs out on backtrack, or records why the move was refused.
- `undo()` — pops the previous path off `history`.
- `hint()` — applies `applyHint` and counts the hint; undoable like any other move.
- `clearBlocked()` — drops the refused-move marker.
- `numberAt(cell)` — the number drawn on a cell, or `undefined`.

Undo is a stack of **path snapshots** rather than inverse operations: a path is at most 36 cells,
and a snapshot cannot drift out of step with the board the way a replay would.

Computed: `solved`, `canUndo`, `head`, `pathKeys`, `filled`, `cellCount`, `nextNumber`,
`progressLabel`, `hintsLabel`, `blockedLabel`.

### The clock

`startedAt` is stamped when the board is dealt — not on the first move, so two players of the
same board are comparable. `commit` stamps `finishedAt` the moment a move completes the board,
which keeps the recorded time exact rather than rounded to the page's one-second tick; `undo`
clears it again, so taking a move back resumes the clock. The page owns the ticking `now` signal
and renders `(finishedAt ?? now) - startedAt` through `formatElapsed`.

## ZipPage

Routed at `/zip` behind `isAuthenticatedGuard`, in the `games` feature block next to `/quiz`. That
block is `defaultAvailability: 'disabled'`, so the route is gated off for every tenant until the
ruling changes — see the `games` block comment in `feature-blocks.ts`.

### Geometry: one coordinate system

The grid lines AND the path are drawn by the SAME inline SVG, over a `viewBox` measured in cells;
the CSS grid on top holds only transparent hit targets and the number badges, as
`position: absolute; inset: 0` with `1fr` tracks in both axes.

This is a fix, not a preference. The first version drew the grid as per-cell CSS borders: each
1px border consumes width *inside* its cell, so the cell centres drifted a few pixels away from
the SVG's exact sixths and the path visibly sat off-grid by the right-hand columns. The same
change is what guarantees equal rows and columns — an absolutely-positioned overlay with `1fr`
tracks cannot be stretched by a badge that renders slightly too tall.

Two further implementation notes worth keeping:

- **One pointer handler pair on the board, not `pointerenter` per cell.** On touch the element
  that sees the `pointerdown` implicitly captures the pointer, so enter/leave never fire on the
  cells the finger drags across and the path would stop at its first cell. Every move is instead
  hit-tested with `document.elementFromPoint`, which behaves identically for mouse and touch. The
  board also needs `touch-action: none`, or a drag scrolls the page.
- **The path is one SVG polyline** over a `viewBox` measured in cells, so a point is just the
  cell's centre and the rounded caps and joins come from the stroke — no per-cell corner logic.

## i18n

Keys live in `@okr/games-zip-util` (`zip-i18n.ts`, `PFX = '@games/zip/feature.'`), bundles in
`libs/games/zip/feature/src/i18n/{de,en,fr,es,it}.json`. `progress`, `hints_used` and
`blocked.order` carry single-brace parameters filled with `fill()` from `@okr/shared-util-core` —
`translateAll` strips `{{double}}` braces, so they must not be used here.
