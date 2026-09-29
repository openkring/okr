import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  BIMARU_I18N_KEYS,
  BimaruI18n,
  BimaruPuzzle,
  BimaruSize,
  Mark,
  completedShips,
  coordLabel,
  fillLineWithWater,
  formatDuration,
  generatePuzzle,
  hintCell,
  initialMarks,
  isSolved,
  markedCounts,
  nextMark,
  setMark,
  solutionGiven,
  wrongCells,
} from '@okr/games-bimaru-util';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it.
 */
export type StatusPart = {
  key: keyof typeof BIMARU_I18N_KEYS;
  params?: Record<string, string | number>;
};

type Snapshot = { marks: Mark[][]; fixed: string[] };

export type BimaruState = {
  size: BimaruSize;
  puzzle: BimaruPuzzle;
  marks: Mark[][];
  /** Cells the player cannot change: the givens plus every cell a hint revealed, as "r,c". */
  fixed: string[];
  history: Snapshot[];
  hints: number;
  /** Set by «Prüfen»; the next move clears it again. */
  showErrors: boolean;
  startedAt: number;
  solvedAt: number | null;
  status: StatusPart | null;
};

const DEFAULT_SIZE: BimaruSize = 8;

function freshGame(size: BimaruSize): Omit<BimaruState, 'size'> {
  const puzzle = generatePuzzle(size);
  return {
    puzzle,
    marks: initialMarks(puzzle),
    fixed: puzzle.givens.map(g => `${g.r},${g.c}`),
    history: [],
    hints: 0,
    showErrors: false,
    startedAt: Date.now(),
    solvedAt: null,
    status: null,
  };
}

/**
 * Bimaru, in memory. The pure rules live in `@okr/games-bimaru-util`; this store only keeps the
 * running game — the player's marks, an undo stack of snapshots, and the hint count.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const BimaruStore = signalStore(
  withState<BimaruState>(() => ({ size: DEFAULT_SIZE, ...freshGame(DEFAULT_SIZE) })),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(BIMARU_I18N_KEYS) as BimaruI18n,
  })),

  withComputed(store => ({
    solved: computed((): boolean => store.solvedAt() !== null),
    counts: computed(() => markedCounts(store.marks())),
    completed: computed((): number[] => completedShips(store.marks())),
    wrong: computed((): Set<string> => {
      if (!store.showErrors()) return new Set();
      return new Set(wrongCells(store.puzzle(), store.marks()).map(([r, c]) => `${r},${c}`));
    }),
    fixedSet: computed((): Set<string> => new Set(store.fixed())),

    statusText: computed((): string => {
      const part = store.status();
      if (!part) return store.i18n.status_play();
      return fill(store.i18n[part.key](), part.params ?? {});
    }),
  })),

  withMethods(store => {
    function commit(marks: Mark[][], fixed: string[] = store.fixed()): void {
      const history = [...store.history(), { marks: store.marks(), fixed: store.fixed() }];
      patchState(store, { marks, fixed, history, showErrors: false, status: null });
      if (isSolved(store.puzzle(), marks)) {
        const solvedAt = Date.now();
        const time = formatDuration(solvedAt - store.startedAt());
        const hints = store.hints();
        patchState(store, {
          solvedAt,
          status: hints
            ? { key: 'status_solved_hints', params: { time, count: hints } }
            : { key: 'status_solved', params: { time } },
        });
      }
    }

    return {
      newGame(size: BimaruSize = store.size()): void {
        patchState(store, { size, ...freshGame(size) });
      },

      /** Tap on a cell: unknown → water → ship → unknown. Revealed cells stay as they are. */
      cycle(r: number, c: number): void {
        if (store.solved() || store.fixedSet().has(`${r},${c}`)) return;
        commit(setMark(store.marks(), r, c, nextMark(store.marks()[r][c])));
      },

      /** Tap on an edge number: the rest of that row or column is water. */
      fillLine(line: 'row' | 'col', index: number): void {
        if (store.solved()) return;
        const marks = fillLineWithWater(store.marks(), line, index);
        if (marks.every((row, r) => row.every((m, c) => m === store.marks()[r][c]))) return;
        commit(marks);
      },

      undo(): void {
        const history = store.history();
        if (!history.length || store.solved()) return;
        const last = history[history.length - 1];
        patchState(store, { marks: last.marks, fixed: last.fixed, history: history.slice(0, -1), showErrors: false, status: null });
      },

      hint(): void {
        if (store.solved()) return;
        const cell = hintCell(store.puzzle(), store.marks());
        if (!cell) {
          patchState(store, { status: { key: 'status_no_hint' } });
          return;
        }
        const [r, c] = cell;
        const isShip = solutionGiven(store.puzzle(), r, c).value !== 'water';
        patchState(store, { hints: store.hints() + 1 });
        commit(setMark(store.marks(), r, c, isShip ? 'ship' : 'water'), [...store.fixed(), `${r},${c}`]);
        if (!store.solved()) patchState(store, { status: { key: 'status_hint', params: { at: coordLabel(r, c) } } });
      },

      check(): void {
        if (store.solved()) return;
        const count = wrongCells(store.puzzle(), store.marks()).length;
        patchState(store, {
          showErrors: true,
          status: count === 0
            ? { key: 'status_no_errors' }
            : count === 1 ? { key: 'status_error_one' } : { key: 'status_errors', params: { count } },
        });
      },
    };
  }),
);

/** The translated name of a ship by its length. */
export function shipName(i18n: BimaruI18n, len: number): string {
  switch (len) {
    case 4: return i18n.ship_4();
    case 3: return i18n.ship_3();
    case 2: return i18n.ship_2();
    default: return i18n.ship_1();
  }
}
