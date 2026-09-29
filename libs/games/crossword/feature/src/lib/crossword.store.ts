import { computed, effect, inject, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';

import { CrosswordTopicService } from '@okr/games-crossword-data-access';
import { CrosswordSelectedCell } from '@okr/games-crossword-ui';
import {
  CROSSWORD_I18N_KEYS,
  CellView,
  CrosswordI18n,
  buildCellMap,
  loadProgress,
  saveProgress,
} from '@okr/games-crossword-util';

export type CrosswordState = {
  /** Set once via `load()`; empty until the page provides it. */
  topicKey: string;
  /** 'row,col' → the letter the player has typed there. Never sent to Firestore. */
  filled: Map<string, string>;
  selected: CrosswordSelectedCell | undefined;
  /** Cells the player asked to have revealed (reveal-letter/-word), for the status line. */
  revealed: number;
  /** True right after `check()`, until the next edit — the board reads it to hatch wrong cells. */
  checking: boolean;
  startedAt: number;
  finishedAt: number | undefined;
  /** Guards the one-time seed from `loadProgress` — see the store's doc comment. */
  progressSeeded: boolean;
};

const initialState: CrosswordState = {
  topicKey: '',
  filled: new Map(),
  selected: undefined,
  revealed: 0,
  checking: false,
  startedAt: Date.now(),
  finishedAt: undefined,
  progressSeeded: false,
};

/** The unbroken run of cells starting at (row, col) and continuing in `direction`. */
function runFrom(map: CellView[][], row: number, col: number, direction: 'across' | 'down'): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  let r = row;
  let c = col;
  while (r < map.length && c < map[0].length && !map[r][c].blocked) {
    cells.push({ row: r, col: c });
    if (direction === 'across') c++; else r++;
  }
  return cells;
}

/** Walks back to the first cell of the run (row, col) sits inside, in `direction`. */
function runStart(map: CellView[][], row: number, col: number, direction: 'across' | 'down'): { row: number; col: number } {
  let r = row;
  let c = col;
  for (;;) {
    const pr = direction === 'across' ? r : r - 1;
    const pc = direction === 'across' ? c - 1 : c;
    if (pr < 0 || pc < 0 || pr >= map.length || pc >= map[0].length || map[pr][pc].blocked) break;
    r = pr;
    c = pc;
  }
  return { row: r, col: c };
}

/** The whole run (row, col) sits inside, in `direction` — from its first cell to its last. */
function runOf(map: CellView[][], row: number, col: number, direction: 'across' | 'down'): { row: number; col: number }[] {
  const start = runStart(map, row, col, direction);
  return runFrom(map, start.row, start.col, direction);
}

/**
 * One play session on one `CrosswordTopicModel`. Component-provided on `CrosswordPage` — a fresh
 * store per navigation, like `ZipStore` and `HearingQuizSessionStore`.
 *
 * The topic is fetched ONCE (`load`), not kept as a live subscription: `CrosswordTopicService.get`
 * returns a `docData()` stream, and re-seeding `filled` on every later emission (an admin
 * re-publishing the same topic, a reconnect) would silently wipe whatever the player has typed —
 * exactly the `linkedSignal`-over-Firestore-stream bug this repo has already been bitten by. The
 * `withHooks` effect below seeds `filled` from `loadProgress` exactly once, gated on
 * `topicLoaded()` (an explicit boolean the store derives from `topicResource`'s own status, never
 * on `topic()`'s truthiness — a loading resource is `undefined` too and must not be read as "no
 * saved progress").
 */
export const CrosswordStore = signalStore(
  withState<CrosswordState>(initialState),

  withProps(() => ({
    topicService: inject(CrosswordTopicService),
    i18n: inject(I18nService).translateAll(CROSSWORD_I18N_KEYS) as CrosswordI18n,
  })),

  withProps(store => ({
    // `topicKey` is a single state signal, never several signals folded together at read time —
    // the resource-params pitfall this repo hit once already (a re-derived key that compares
    // unequal every time even when nothing meaningful changed).
    topicResource: rxResource({
      params: () => store.topicKey() || undefined,
      stream: ({ params }) => store.topicService.get(params),
    }),
  })),

  withComputed(store => ({
    topic: computed(() => store.topicResource.value()),
    /** True once the fetch for the current `topicKey` has settled, one way or the other. */
    topicLoaded: computed(() => store.topicKey() !== '' && !store.topicResource.isLoading()),
  })),

  withComputed(store => ({
    notFound: computed(() => store.topicLoaded() && !store.topic()),

    /** The solution, as a dense grid — `undefined` until the topic (and its grid) has loaded. */
    solutionMap: computed((): CellView[][] | undefined => {
      const topic = store.topic();
      if (!topic?.grid) return undefined;
      return buildCellMap(topic.grid, topic.entries);
    }),
  })),

  withComputed(store => ({
    /** The clue number of the run the current selection sits in, for `CrosswordClues`. */
    activeNumber: computed((): number | undefined => {
      const map = store.solutionMap();
      const sel = store.selected();
      if (!map || !sel) return undefined;
      const start = runStart(map, sel.row, sel.col, sel.direction);
      return map[start.row][start.col].number;
    }),

    solved: computed(() => {
      const map = store.solutionMap();
      if (!map) return false;
      const filled = store.filled();
      for (let r = 0; r < map.length; r++) {
        for (let c = 0; c < map[r].length; c++) {
          const cell = map[r][c];
          if (!cell.blocked && filled.get(`${r},${c}`) !== cell.letter) return false;
        }
      }
      return true;
    }),
  })),

  withMethods(store => {
    /** Persists `filled` for this device, then re-checks for a solve. */
    function commitFilled(filled: Map<string, string>): void {
      const topic = store.topic();
      const wasSolved = store.solved();
      patchState(store, { filled, checking: false });
      if (topic?.grid) saveProgress(topic.okey, topic.grid, filled);
      if (!wasSolved && store.solved()) patchState(store, { finishedAt: Date.now() });
    }

    return {
      /** Starts a session on `topicKey`. Call once, right after the page is created. */
      load(topicKey: string): void {
        patchState(store, { ...initialState, topicKey, startedAt: Date.now() });
      },

      /**
       * Picks a cell. Clicking the already-selected cell flips direction (across ↔ down) when
       * the other direction also runs through it; otherwise the previous direction is kept where
       * it still applies, and falls back to whichever direction has a run there.
       */
      select(row: number, col: number): void {
        const map = store.solutionMap();
        if (!map || map[row][col].blocked) return;

        const sel = store.selected();
        const across = runOf(map, row, col, 'across');
        const down = runOf(map, row, col, 'down');

        let direction: 'across' | 'down';
        if (sel?.row === row && sel.col === col && across.length > 1 && down.length > 1) {
          direction = sel.direction === 'across' ? 'down' : 'across';
        } else if (sel?.direction === 'across' && across.length > 1) {
          direction = 'across';
        } else if (sel?.direction === 'down' && down.length > 1) {
          direction = 'down';
        } else {
          direction = across.length > 1 ? 'across' : 'down';
        }
        patchState(store, { selected: { row, col, direction }, checking: false });
      },

      /** Jumps straight to a clue's first cell and direction — no toggle inference (`CrosswordClues`). */
      selectClue(row: number, col: number, direction: 'across' | 'down'): void {
        patchState(store, { selected: { row, col, direction }, checking: false });
      },

      /** Types one letter into the selected cell and advances to the next cell of the run. */
      setLetter(letter: string): void {
        const map = store.solutionMap();
        const sel = store.selected();
        const upper = letter.slice(-1).toUpperCase();
        if (!map || !sel || !/^[A-Z]$/.test(upper)) return;

        const filled = new Map(store.filled());
        filled.set(`${sel.row},${sel.col}`, upper);
        commitFilled(filled);

        const run = runOf(map, sel.row, sel.col, sel.direction);
        const index = run.findIndex(c => c.row === sel.row && c.col === sel.col);
        const next = run[index + 1];
        if (next) patchState(store, { selected: { ...next, direction: sel.direction } });
      },

      /** Clears the selected cell; an empty cell instead clears the previous one (typewriter). */
      backspace(): void {
        const map = store.solutionMap();
        const sel = store.selected();
        if (!map || !sel) return;

        const key = `${sel.row},${sel.col}`;
        const filled = new Map(store.filled());
        if (filled.has(key)) {
          filled.delete(key);
          commitFilled(filled);
          return;
        }
        const run = runOf(map, sel.row, sel.col, sel.direction);
        const index = run.findIndex(c => c.row === sel.row && c.col === sel.col);
        const prev = run[index - 1];
        if (!prev) return;
        filled.delete(`${prev.row},${prev.col}`);
        commitFilled(filled);
        patchState(store, { selected: { ...prev, direction: sel.direction } });
      },

      /** Marks the currently filled cells right/wrong; cleared again on the next edit. */
      check(): void {
        patchState(store, { checking: true });
      },

      /** Reveals the letter at the selected cell. Counted, even if it was already correct. */
      revealLetter(): void {
        const map = store.solutionMap();
        const sel = store.selected();
        if (!map || !sel) return;
        const cell = map[sel.row][sel.col];
        if (store.filled().get(`${sel.row},${sel.col}`) === cell.letter) return;

        const filled = new Map(store.filled());
        filled.set(`${sel.row},${sel.col}`, cell.letter);
        commitFilled(filled);
        patchState(store, { revealed: store.revealed() + 1 });
      },

      /** Reveals every cell of the run the selection sits in. */
      revealWord(): void {
        const map = store.solutionMap();
        const sel = store.selected();
        if (!map || !sel) return;

        const run = runOf(map, sel.row, sel.col, sel.direction);
        const filled = new Map(store.filled());
        let changed = 0;
        for (const cell of run) {
          const key = `${cell.row},${cell.col}`;
          const letter = map[cell.row][cell.col].letter;
          if (filled.get(key) !== letter) {
            filled.set(key, letter);
            changed++;
          }
        }
        if (changed === 0) return;
        commitFilled(filled);
        patchState(store, { revealed: store.revealed() + changed });
      },

      /** Clears the board and starts the clock over; the saved progress is cleared too. */
      restart(): void {
        const topic = store.topic();
        patchState(store, {
          filled: new Map(),
          selected: undefined,
          revealed: 0,
          checking: false,
          startedAt: Date.now(),
          finishedAt: undefined,
        });
        if (topic?.grid) saveProgress(topic.okey, topic.grid, new Map());
      },
    };
  }),

  withHooks({
    onInit(store) {
      // Reactively depends ONLY on `topicLoaded` (a plain boolean): once it flips to `true` it
      // never flips back for this store instance (one `load()` per page), so this runs exactly
      // once. `topic()` and `progressSeeded()` are read `untracked` so a later re-emission of
      // the (still-subscribed) topic stream cannot re-trigger the seed and wipe the player's
      // input — the seed itself, not just its guard, stays outside the reactive graph.
      effect(() => {
        if (!store.topicLoaded()) return;
        untracked(() => {
          if (store.progressSeeded()) return;
          const topic = store.topic();
          if (!topic?.grid) return;
          patchState(store, { filled: loadProgress(topic.okey, topic.grid), progressSeeded: true });
        });
      });
    },
  }),
);
