import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  SUDOKU_GAME_KEY,
  SUDOKU_I18N_KEYS,
  SudokuDifficulty,
  SudokuGame,
  SudokuI18n,
  SudokuPuzzle,
  conflictCells,
  coordLabel,
  digitCounts,
  formatDuration,
  generatePuzzle,
  hintCell,
  isSolved,
  parseGame,
  placeIntoNotes,
  serializeGame,
  setValue,
  toggleNote,
  wrongCells,
} from '@okr/games-sudoku-util';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it.
 */
export type StatusPart = {
  key: keyof typeof SUDOKU_I18N_KEYS;
  params?: Record<string, string | number>;
};

type Snapshot = { values: number[]; notes: number[]; hinted: number[] };

export type SudokuState = {
  difficulty: SudokuDifficulty;
  puzzle: SudokuPuzzle;
  values: number[];
  notes: number[];
  /** Cells revealed by a hint; like the clues, they cannot be changed. */
  hinted: number[];
  selected: number | null;
  /** When on, a digit toggles a pencil mark instead of filling the cell. */
  notesMode: boolean;
  history: Snapshot[];
  hints: number;
  /** Set by «Prüfen»; the next move clears it again. */
  showErrors: boolean;
  startedAt: number;
  solvedAt: number | null;
  status: StatusPart | null;
};

const DEFAULT_DIFFICULTY: SudokuDifficulty = 'medium';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode or blocked storage: the game simply is not remembered
  }
}

type GameFields = Omit<SudokuState, 'selected' | 'notesMode'>;

function freshGame(difficulty: SudokuDifficulty): GameFields {
  const puzzle = generatePuzzle(difficulty);
  return {
    difficulty,
    puzzle,
    values: [...puzzle.givens],
    notes: new Array<number>(81).fill(0),
    hinted: [],
    history: [],
    hints: 0,
    showErrors: false,
    startedAt: Date.now(),
    solvedAt: null,
    status: null,
  };
}

/** True if an unfinished game is saved, i.e. opening the page resumes it rather than dealing a new one. */
function hasResumableGame(browser: boolean): boolean {
  const saved = browser ? parseGame(read(SUDOKU_GAME_KEY)) : null;
  return !!saved && !saved.solved;
}

/** The saved game if there is an unfinished one, otherwise a fresh deal. */
function initialGame(browser: boolean): GameFields {
  const saved = browser ? parseGame(read(SUDOKU_GAME_KEY)) : null;
  if (!saved || saved.solved) return freshGame(saved?.difficulty ?? DEFAULT_DIFFICULTY);
  return {
    difficulty: saved.difficulty,
    puzzle: { difficulty: saved.difficulty, givens: saved.givens, solution: saved.solution },
    values: saved.values,
    notes: saved.notes,
    hinted: saved.hinted,
    history: [],
    hints: saved.hints,
    showErrors: false,
    startedAt: Date.now() - saved.elapsedMs,
    solvedAt: null,
    status: null,
  };
}

/**
 * Sudoku, played locally. The pure rules live in `@okr/games-sudoku-util`; this store keeps the
 * running game — values, pencil marks, an undo stack of snapshots and the hint count — and
 * mirrors it into `localStorage` after every move so a reload resumes it.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const SudokuStore = signalStore(
  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
    i18n: inject(I18nService).translateAll(SUDOKU_I18N_KEYS) as SudokuI18n,
  })),

  withState<SudokuState>(() => ({
    ...initialGame(isPlatformBrowser(inject(PLATFORM_ID))),
    selected: null,
    notesMode: false,
  })),

  withComputed(store => ({
    solved: computed((): boolean => store.solvedAt() !== null),
    /** Clues plus hinted cells: the cells the player cannot change. */
    locked: computed((): Set<number> => {
      const set = new Set(store.hinted());
      store.puzzle().givens.forEach((g, i) => { if (g) set.add(i); });
      return set;
    }),
    conflicts: computed((): Set<number> => new Set(conflictCells(store.values()))),
    wrong: computed((): Set<number> =>
      store.showErrors() ? new Set(wrongCells(store.puzzle(), store.values())) : new Set()),
    counts: computed((): number[] => digitCounts(store.values())),

    statusText: computed((): string => {
      const part = store.status();
      if (!part) return store.i18n.status_play();
      return fill(store.i18n[part.key](), part.params ?? {});
    }),
  })),

  withMethods(store => {
    function persist(): void {
      if (!store._browser) return;
      const game: SudokuGame = {
        difficulty: store.difficulty(),
        givens: store.puzzle().givens,
        solution: store.puzzle().solution,
        values: store.values(),
        notes: store.notes(),
        hinted: store.hinted(),
        hints: store.hints(),
        elapsedMs: (store.solvedAt() ?? Date.now()) - store.startedAt(),
        solved: store.solved(),
      };
      write(SUDOKU_GAME_KEY, serializeGame(game));
    }

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('sudoku', action, store._appStore.currentUser);
    }

    function commit(values: number[], notes: number[], hinted: number[] = store.hinted()): void {
      const history = [...store.history(), { values: store.values(), notes: store.notes(), hinted: store.hinted() }];
      patchState(store, { values, notes, hinted, history, showErrors: false, status: null });
      if (isSolved(store.puzzle(), values)) {
        const solvedAt = Date.now();
        const time = formatDuration(solvedAt - store.startedAt());
        const hints = store.hints();
        patchState(store, {
          solvedAt,
          selected: null,
          status: hints
            ? { key: 'status_solved_hints', params: { time, count: hints } }
            : { key: 'status_solved', params: { time } },
        });
        logGame('finish');
      }
      persist();
    }

    /** The selected cell if the player may change it, else null (with a nudge if nothing is selected). */
    function editable(): number | null {
      const i = store.selected();
      if (i === null) {
        patchState(store, { status: { key: 'status_select' } });
        return null;
      }
      if (store.solved() || store.locked().has(i)) return null;
      return i;
    }

    return {
      newGame(difficulty: SudokuDifficulty = store.difficulty()): void {
        patchState(store, { ...freshGame(difficulty), selected: null });
        persist();
        logGame('start');
      },

      select(i: number): void {
        if (store.solved()) return;
        patchState(store, { selected: store.selected() === i ? null : i });
      },

      /** Arrow keys: move the selection, wrapping at the edges. */
      move(dr: number, dc: number): void {
        if (store.solved()) return;
        const i = store.selected() ?? 40;
        const r = (Math.floor(i / 9) + dr + 9) % 9;
        const c = ((i % 9) + dc + 9) % 9;
        patchState(store, { selected: r * 9 + c });
      },

      toggleNotesMode(): void {
        patchState(store, { notesMode: !store.notesMode() });
      },

      /** A digit from the pad or the keyboard: fill the cell, or toggle a note in notes mode. */
      input(digit: number): void {
        const i = editable();
        if (i === null) return;
        if (store.notesMode()) {
          if (store.values()[i]) return;
          commit(store.values(), toggleNote(store.notes(), i, digit));
          return;
        }
        // the same digit again empties the cell
        if (store.values()[i] === digit) {
          commit(setValue(store.values(), i, 0), store.notes());
          return;
        }
        commit(setValue(store.values(), i, digit), placeIntoNotes(store.notes(), i, digit));
      },

      erase(): void {
        const i = editable();
        if (i === null) return;
        if (!store.values()[i] && !store.notes()[i]) return;
        const notes = [...store.notes()];
        notes[i] = 0;
        commit(setValue(store.values(), i, 0), notes);
      },

      undo(): void {
        const history = store.history();
        if (!history.length || store.solved()) return;
        const last = history[history.length - 1];
        patchState(store, { ...last, history: history.slice(0, -1), showErrors: false, status: null });
        persist();
      },

      hint(): void {
        if (store.solved()) return;
        const selected = store.selected();
        const i = hintCell(store.puzzle(), store.values(), selected !== null && store.locked().has(selected) ? null : selected);
        if (i === null) {
          patchState(store, { status: { key: 'status_no_hint' } });
          return;
        }
        const digit = store.puzzle().solution[i];
        patchState(store, { hints: store.hints() + 1, selected: i });
        commit(setValue(store.values(), i, digit), placeIntoNotes(store.notes(), i, digit), [...store.hinted(), i]);
        if (!store.solved()) patchState(store, { status: { key: 'status_hint', params: { at: coordLabel(i) } } });
      },

      check(): void {
        if (store.solved()) return;
        const count = wrongCells(store.puzzle(), store.values()).length;
        patchState(store, {
          showErrors: true,
          status: count === 0
            ? { key: 'status_no_errors' }
            : count === 1 ? { key: 'status_error_one' } : { key: 'status_errors', params: { count } },
        });
      },
    };
  }),

  withHooks({
    // Opening the page without a saved game deals a fresh one: that is a start too. A resumed
    // game was already logged when it was dealt.
    onInit(store) {
      if (store._browser && !hasResumableGame(store._browser)) {
        store._activityService.logGame('sudoku', 'start', store._appStore.currentUser);
      }
    },
  }),
);
