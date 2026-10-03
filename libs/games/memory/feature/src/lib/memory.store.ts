import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  MEMORY_BEST_KEY,
  MEMORY_CONFIG_KEY,
  MEMORY_I18N_KEYS,
  MEMORY_SYMBOLS,
  MemoryBest,
  MemoryBoard,
  MemoryConfig,
  MemoryI18n,
  closeMiss,
  formatDuration,
  isFinished,
  isNewBest,
  leaders,
  missPending,
  newBoard,
  parseBest,
  parseConfig,
  reveal,
} from '@okr/games-memory-util';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it.
 */
export type StatusPart = {
  key: keyof typeof MEMORY_I18N_KEYS;
  params?: Record<string, string | number>;
};

export type MemoryState = {
  config: MemoryConfig;
  board: MemoryBoard;
  best: MemoryBest;
  /** Set on the first card turned, so the clock does not run while the board is only looked at. */
  startedAt: number | null;
  solvedAt: number | null;
  status: StatusPart | null;
};

/** How long a miss stays visible before it turns back over by itself. */
const MISS_DELAY_MS = 900;

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
    // private mode or blocked storage: the settings simply are not remembered
  }
}

function fresh(config: MemoryConfig): Pick<MemoryState, 'board' | 'startedAt' | 'solvedAt' | 'status'> {
  return {
    board: newBoard(config.size, config.players, MEMORY_SYMBOLS[config.theme].length),
    startedAt: null,
    solvedAt: null,
    status: null,
  };
}

/**
 * Pairs, played locally by one or two players on one device. The pure rules live in
 * `@okr/games-memory-util`; this store keeps the running board, closes a miss after a short
 * pause, and remembers the settings and the best solo result per size in `localStorage`.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const MemoryStore = signalStore(
  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _timer: { handle: undefined as ReturnType<typeof setTimeout> | undefined },
    i18n: inject(I18nService).translateAll(MEMORY_I18N_KEYS) as MemoryI18n,
  })),

  withState<MemoryState>(() => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const config = browser ? parseConfig(read(MEMORY_CONFIG_KEY)) : parseConfig(null);
    return { config, best: browser ? parseBest(read(MEMORY_BEST_KEY)) : {}, ...fresh(config) };
  }),

  withComputed(store => ({
    solved: computed((): boolean => store.solvedAt() !== null),
    symbols: computed((): readonly string[] => MEMORY_SYMBOLS[store.config().theme]),
    bestText: computed((): string => {
      const best = store.best()[store.config().size];
      return best ? fill(store.i18n.best(), { moves: best.moves, time: formatDuration(best.ms) }) : '';
    }),
    statusText: computed((): string => {
      const part = store.status();
      if (part) return fill(store.i18n[part.key](), part.params ?? {});
      if (store.board().scores.length > 1) return fill(store.i18n.status_turn(), { n: store.board().current + 1 });
      return store.i18n.status_play();
    }),
  })),

  withMethods(store => {
    function cancelTimer(): void {
      clearTimeout(store._timer.handle);
      store._timer.handle = undefined;
    }

    function close(): void {
      cancelTimer();
      if (!missPending(store.board())) return;
      patchState(store, { board: closeMiss(store.board()), status: null });
    }

    function finish(board: MemoryBoard): void {
      const solvedAt = Date.now();
      const ms = solvedAt - (store.startedAt() ?? solvedAt);
      const { size } = store.config();
      let status: StatusPart;
      if (board.scores.length > 1) {
        const top = leaders(board);
        status = top.length > 1
          ? { key: 'status_draw', params: { count: board.scores[top[0]] } }
          : { key: 'status_winner', params: { n: top[0] + 1, count: board.scores[top[0]] } };
      } else if (isNewBest(store.best(), size, board.moves, ms)) {
        const best = { ...store.best(), [size]: { moves: board.moves, ms } };
        patchState(store, { best });
        if (store._browser) write(MEMORY_BEST_KEY, JSON.stringify(best));
        status = { key: 'status_solved_best', params: { moves: board.moves, time: formatDuration(ms) } };
      } else {
        status = { key: 'status_solved', params: { moves: board.moves, time: formatDuration(ms) } };
      }
      patchState(store, { solvedAt, status });
    }

    return {
      /** Start over, optionally with changed settings, which are remembered. */
      newGame(change: Partial<MemoryConfig> = {}): void {
        cancelTimer();
        const config = { ...store.config(), ...change };
        if (store._browser) write(MEMORY_CONFIG_KEY, JSON.stringify(config));
        patchState(store, { config, ...fresh(config) });
      },

      /** Tap on a card. Tapping while a miss is still showing turns the miss over first. */
      flip(i: number): void {
        if (store.solved()) return;
        if (missPending(store.board())) close();
        const { board, outcome } = reveal(store.board(), i);
        if (outcome === 'ignored') return;
        patchState(store, { board, startedAt: store.startedAt() ?? Date.now(), status: null });

        if (outcome === 'match') {
          if (isFinished(board)) {
            finish(board);
          } else if (board.scores.length > 1) {
            patchState(store, { status: { key: 'status_match_again', params: { n: board.current + 1 } } });
          } else {
            patchState(store, { status: { key: 'status_match' } });
          }
        } else if (outcome === 'miss') {
          store._timer.handle = setTimeout(close, MISS_DELAY_MS);
        }
      },

      _cancelTimer: cancelTimer,
    };
  }),

  withHooks(store => ({
    onDestroy: () => store._cancelTimer(),
  })),
);
