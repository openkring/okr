import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  ZIP_DEFAULT_CONFIG,
  ZIP_I18N_KEYS,
  ZipCell,
  ZipConfig,
  ZipI18n,
  ZipMoveVerdict,
  ZipPuzzle,
  applyHint,
  cellKey,
  checkpointNumberAt,
  clampZipConfig,
  generateZipPuzzle,
  isBacktrack,
  isSolved,
  judgeMove,
  reachedCheckpoints,
  startPath,
} from '@okr/games-zip-util';

export type ZipState = {
  config: ZipConfig;
  puzzle: ZipPuzzle;
  /** The cells the player has drawn, in order. Always opens on the first checkpoint. */
  path: ZipCell[];
  /** One snapshot of `path` per move, newest last. Undo pops it; a new board clears it. */
  history: ZipCell[][];
  hintsUsed: number;
  /** Why the last attempted move was refused, or `undefined` when it was played. */
  blocked: ZipMoveVerdict | undefined;
  /** The cell that refused move aimed at — the board hatches it in red. */
  blockedCell: ZipCell | undefined;
  /** `Date.now()` when this board was dealt — the clock starts with the board, not with the
   *  first move, so two players of the same board are comparable. */
  startedAt: number;
  /** `Date.now()` when the board was solved; `undefined` while it is still running. The page
   *  reads this to freeze the timer instead of stopping its interval. */
  finishedAt: number | undefined;
};

function freshState(config: ZipConfig): ZipState {
  const clamped = clampZipConfig(config);
  const puzzle = generateZipPuzzle(clamped);
  return {
    config: clamped,
    puzzle,
    path: startPath(puzzle),
    history: [],
    hintsUsed: 0,
    blocked: undefined,
    blockedCell: undefined,
    startedAt: Date.now(),
    finishedAt: undefined,
  };
}

/**
 * The whole game, in memory. Nothing here is persisted: closing the page ends the board, which
 * is what the other `games` screen does too and what a throwaway puzzle warrants.
 *
 * Every path change goes through `commit`, so undo is a plain stack of previous paths rather
 * than a set of inverse operations — the paths are at most 36 cells, and a snapshot per move
 * cannot drift out of step with the board the way a replay would.
 *
 * Provide it on the component (`providers: [ZipStore]`); it is deliberately not rooted, so two
 * boards would not share a state.
 */
export const ZipStore = signalStore(
  withState<ZipState>(() => freshState(ZIP_DEFAULT_CONFIG)),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(ZIP_I18N_KEYS) as ZipI18n,
  })),

  withComputed(store => ({
    /** Cell keys of the drawn path, for O(1) lookup while rendering the board. */
    pathKeys: computed(() => new Set(store.path().map(cellKey))),

    /** The cell the next move extends from. */
    head: computed((): ZipCell | undefined => store.path()[store.path().length - 1]),

    solved: computed(() => isSolved(store.path(), store.puzzle())),

    canUndo: computed(() => store.history().length > 0),

    /** How many cells are filled, and how many there are in total. */
    filled: computed(() => store.path().length),
    cellCount: computed(() => store.puzzle().size * store.puzzle().size),

    /** The number the player has to reach next, or `undefined` once the last one is collected. */
    nextNumber: computed((): number | undefined => {
      const reached = reachedCheckpoints(store.path(), store.puzzle());
      return reached < store.puzzle().checkpoints.length ? reached + 1 : undefined;
    }),
  })),

  withComputed(store => ({
    progressLabel: computed(() =>
      fill(store.i18n.progress(), { done: store.filled(), total: store.cellCount() }),
    ),

    hintsLabel: computed(() => fill(store.i18n.hints_used(), { count: store.hintsUsed() })),

    /** The sentence explaining the refused move, or `''` while nothing is refused. */
    blockedLabel: computed(() => {
      switch (store.blocked()) {
        case 'already-visited':
          return store.i18n.blocked_visited();
        case 'not-adjacent':
        case 'off-board':
          return store.i18n.blocked_adjacent();
        case 'out-of-order':
          return fill(store.i18n.blocked_order(), { next: store.nextNumber() ?? '' });
        case 'finished':
          return store.i18n.blocked_finished();
        default:
          return '';
      }
    }),
  })),

  withMethods(store => {
    /**
     * Replaces the path, remembering the old one so undo can bring it back, and stamps the
     * finish time the moment the board comes out solved.
     *
     * Stopping the clock here rather than in an effect keeps it exact: the timestamp is the
     * move that completed the board, not the next tick of the page's one-second interval. Undo
     * clears it again, so a player who takes a move back is running once more.
     */
    function commit(path: ZipCell[]): void {
      const solved = isSolved(path, store.puzzle());
      patchState(store, state => ({
        path,
        history: [...state.history, state.path],
        blocked: undefined,
        blockedCell: undefined,
        finishedAt: solved ? Date.now() : state.finishedAt,
      }));
    }

    return {
      /** Deals a new board. Falls back to the current config when none is given. */
      newGame(config?: ZipConfig): void {
        patchState(store, freshState(config ?? store.config()));
      },

      setSize(size: number): void {
        this.newGame(clampZipConfig({ size, count: store.config().count }));
      },

      setCount(count: number): void {
        this.newGame(clampZipConfig({ size: store.config().size, count }));
      },

      /**
       * Plays one step onto `cell`.
       *
       * Dragging back onto the cell the path came from rubs the last step out instead of
       * drawing — that is how a player corrects a wrong turn mid-drag, so it is a move like any
       * other and goes on the undo stack. A refused step leaves the path alone and records why,
       * which the board shows as the red hatching over the offending cell.
       */
      extend(cell: ZipCell): void {
        const path = store.path();

        if (isBacktrack(path, cell)) {
          commit(path.slice(0, -1));
          return;
        }

        // Re-entering the head mid-drag is the pointer sitting still, not a move.
        if (path.length > 0 && cellKey(path[path.length - 1]) === cellKey(cell)) {
          return;
        }

        const verdict = judgeMove(path, cell, store.puzzle());
        if (verdict !== 'ok') {
          patchState(store, { blocked: verdict, blockedCell: cell });
          return;
        }

        commit([...path, cell]);
      },

      /** Takes back the last move. Does nothing on a board that has not been played yet. */
      undo(): void {
        patchState(store, state => {
          const previous = state.history[state.history.length - 1];
          if (previous === undefined) {
            return {};
          }
          return {
            path: previous,
            history: state.history.slice(0, -1),
            blocked: undefined,
            blockedCell: undefined,
            finishedAt: undefined,
          };
        });
      },

      /**
       * Rewinds to the last cell the path shared with the stored solution and plays the next one
       * along it. Counted, and undoable like a normal move.
       */
      hint(): void {
        const hinted = applyHint(store.path(), store.puzzle());
        if (hinted.length === store.path().length) {
          return;
        }
        commit(hinted);
        patchState(store, state => ({ hintsUsed: state.hintsUsed + 1 }));
      },

      /** Clears the refused-move marker once the player has seen it. */
      clearBlocked(): void {
        patchState(store, { blocked: undefined, blockedCell: undefined });
      },

      /** The number drawn on a cell, or `undefined` for a blank one. */
      numberAt(cell: ZipCell): number | undefined {
        return checkpointNumberAt(cell, store.puzzle().checkpoints);
      },
    };
  }),
);
