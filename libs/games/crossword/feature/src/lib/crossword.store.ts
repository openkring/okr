import { computed, effect, inject, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';

import { CrosswordTopicService } from '@okr/games-crossword-data-access';
import { CrosswordSelectedCell } from '@okr/games-crossword-ui';
import {
  CROSSWORD_I18N_KEYS,
  CellView,
  CrosswordI18n,
  buildCellMap,
  cellAt,
  countWrong,
  finishedAtAfterEdit,
  hasExpandedLetters,
  inputLetter,
  isSolved,
  loadProgress,
  nextDirection,
  runOf,
  runStart,
  saveProgress,
  stepInRun,
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
  /** Set once this board's solve was logged, so un-solving and re-solving it is not a second finish. */
  finishLogged: boolean;
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
  finishLogged: false,
};

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
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
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
      return cellAt(map, start.row, start.col)?.number;
    }),

    /** True once every unblocked cell holds its solution letter — see `isSolved`. */
    solved: computed(() => {
      const map = store.solutionMap();
      return map ? isSolved(map, store.filled()) : false;
    }),

    /** How many of the currently filled cells are wrong, right after `check()`; 0 otherwise. */
    wrongCount: computed(() => {
      const map = store.solutionMap();
      return map && store.checking() ? countWrong(map, store.filled()) : 0;
    }),

    /** True when the grid spells some answer's Ä/Ö/Ü/ß as two cells, so the page explains it. */
    showUmlautHint: computed(() => hasExpandedLetters(store.topic()?.entries ?? [])),
  })),

  withMethods(store => {
    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('crossword', action, store._appStore.currentUser);
    }

    /**
     * Persists `filled` for this device, then re-checks for a solve — either edge. Fixing the
     * solve stamps `finishedAt` (freezing the page's clock); editing a solved board back to
     * unsolved (overtyping a correct cell) clears it again, or the clock would stay frozen on a
     * board that is visibly no longer done.
     */
    function commitFilled(filled: Map<string, string>): void {
      const topic = store.topic();
      const wasSolved = store.solved();
      patchState(store, { filled, checking: false });
      if (topic?.grid) saveProgress(topic.okey, topic.grid, filled);
      patchState(store, { finishedAt: finishedAtAfterEdit(wasSolved, store.solved(), store.finishedAt(), Date.now()) });
      if (store.solved() && !wasSolved && !store.finishLogged()) {
        patchState(store, { finishLogged: true });
        logGame('finish');
      }
    }

    return {
      /** Starts a session on `topicKey`. Call once, right after the page is created. */
      load(topicKey: string): void {
        patchState(store, { ...initialState, topicKey, startedAt: Date.now() });
      },

      /** Picks a cell; the direction follows `nextDirection` (a second tap on a crossing flips it). */
      select(row: number, col: number): void {
        const map = store.solutionMap();
        const cell = map ? cellAt(map, row, col) : undefined;
        if (!map || !cell || cell.blocked) return;
        const direction = nextDirection(map, store.selected(), row, col);
        patchState(store, { selected: { row, col, direction }, checking: false });
      },

      /**
       * Jumps straight to a clue's first cell and direction — no toggle inference
       * (`CrosswordClues`). Ignores a placement whose start cell is missing or blocked: a
       * placement whose `entry` was since deleted still sits in `grid.placements` (`gridStale`
       * covers the intent, but nothing purges the stale row), and `buildCellMap` renders that
       * cell as an ordinary blocked square.
       */
      selectClue(row: number, col: number, direction: 'across' | 'down'): void {
        const map = store.solutionMap();
        const cell = map ? cellAt(map, row, col) : undefined;
        if (!cell || cell.blocked) return;
        patchState(store, { selected: { row, col, direction }, checking: false });
      },

      /**
       * Types one letter into the selected cell and advances to the next cell of the run. An
       * umlaut types its first grid letter (Ü → U) — see `inputLetter`.
       */
      setLetter(letter: string): void {
        const map = store.solutionMap();
        const sel = store.selected();
        const typed = inputLetter(letter);
        if (!map || !sel || !typed) return;
        const cell = cellAt(map, sel.row, sel.col);
        if (!cell || cell.blocked) return;

        const filled = new Map(store.filled());
        filled.set(`${sel.row},${sel.col}`, typed);
        commitFilled(filled);

        const next = stepInRun(map, sel, 1);
        if (next) patchState(store, { selected: next });
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
        const prev = stepInRun(map, sel, -1);
        if (!prev) return;
        filled.delete(`${prev.row},${prev.col}`);
        commitFilled(filled);
        patchState(store, { selected: prev });
      },

      /** Marks the currently filled cells right/wrong; cleared again on the next edit. */
      check(): void {
        patchState(store, { checking: true });
      },

      /** Reveals the letter at the selected cell. Counted, even if it was already correct. */
      revealLetter(): void {
        const map = store.solutionMap();
        const sel = store.selected();
        const cell = map && sel ? cellAt(map, sel.row, sel.col) : undefined;
        if (!map || !sel || !cell || cell.blocked) return;
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
          finishLogged: false,
        });
        if (topic?.grid) saveProgress(topic.okey, topic.grid, new Map());
        logGame('start');
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
          const filled = loadProgress(topic.okey, topic.grid);
          patchState(store, { filled, progressSeeded: true });
          // An empty board is a new game on the picked topic; a board with saved letters resumes
          // one that was already logged when it began.
          if (filled.size === 0) store._activityService.logGame('crossword', 'start', store._appStore.currentUser);
          // A board restored already solved must not read as freshly finished — `solved()` was
          // never given a rising edge to catch (there was no earlier, unsolved `filled` to
          // compare against), so without this the clock keeps ticking on a done puzzle. Stamping
          // `startedAt` rather than `Date.now()` gives it a duration of 0 rather than an
          // arbitrary "time to load the page".
          if (store.solved()) patchState(store, { finishedAt: store.startedAt(), finishLogged: true });
        });
      });
    },
  }),
);
