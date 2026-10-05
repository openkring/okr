import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  ClearEvent,
  TETRIS_I18N_KEYS,
  TetrisI18n,
  TetrisState,
  createGame,
  hardDrop,
  holdPiece,
  move,
  parseSavedGame,
  rotate,
  softDrop,
  tick,
} from '@okr/games-tetris-util';

export type TetrisStatus = 'ready' | 'running' | 'paused' | 'over';

/** Inputs that repeat while held (keyboard key or on-screen button kept down). */
export type TetrisHeld = 'left' | 'right' | 'down';
/** Inputs that fire once per press. */
export type TetrisAction = TetrisHeld | 'rotate' | 'rotateCcw' | 'hardDrop' | 'hold';

export type TetrisStoreState = {
  game: TetrisState;
  status: TetrisStatus;
  best: number;
  /** The game that just ended beat the previous best. */
  newBest: boolean;
};

const BEST_KEY = 'tetris.best';
const GAME_KEY = 'tetris.game';

/** Delayed auto shift: a held left/right waits this long, then repeats every `ARR_MS`. */
const DAS_MS = 160;
const ARR_MS = 45;
/** A held soft drop moves one row this often, from the first moment. */
const SOFT_MS = 40;
/** A frame longer than this (tab switch, debugger) is cut, so gravity does not jump. */
const MAX_FRAME_MS = 100;

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode or blocked storage: the game simply is not remembered
  }
}

/**
 * One game of falling blocks, over the pure `@okr/games-tetris-util` engine.
 *
 * THE STORE HAS NO CLOCK. The page owns the `requestAnimationFrame` loop (it owns the canvas the
 * loop draws on) and calls `frame()` once per frame. `game` is patched every frame the piece
 * moves, but the template never reads it directly — only the number-valued computeds below,
 * whose equality check keeps change detection quiet while nothing on the HUD changes.
 *
 * Kept in `localStorage`: the best score, and the running game whenever it pauses (tab hidden,
 * page left, reload) — it comes back paused. Nothing goes to Firestore.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const TetrisStore = signalStore(
  withState<TetrisStoreState>(() => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const saved = browser ? parseSavedGame(read(GAME_KEY)) : null;
    return {
      game: saved ?? createGame(newSeed()),
      status: saved ? 'paused' : 'ready',
      best: browser ? Number(read(BEST_KEY)) || 0 : 0,
      newBest: false,
    };
  }),

  withProps(() => ({
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
    i18n: inject(I18nService).translateAll(TETRIS_I18N_KEYS) as TetrisI18n,
    /** When each held input fires next (`performance.now()` time). */
    _held: new Map<TetrisHeld, number>(),
    /** The horizontal direction pressed last wins while both are held. */
    _lastHorizontal: { dir: null as 'left' | 'right' | null },
  })),

  withComputed(store => ({
    running: computed(() => store.status() === 'running'),
    score: computed(() => store.game().score),
    level: computed(() => store.game().level),
    lines: computed(() => store.game().lines),
    lastClear: computed((): ClearEvent | null => store.game().lastClear),
  })),

  withMethods(store => {
    function releaseAll(): void {
      store._held.clear();
      store._lastHorizontal.dir = null;
    }

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('tetris', action, store._appStore.currentUser);
    }

    function finish(game: TetrisState): void {
      if (store.status() === 'over') return;
      releaseAll();
      write(GAME_KEY, null);
      const newBest = game.score > store.best();
      if (newBest) write(BEST_KEY, String(game.score));
      patchState(store, { game, status: 'over', newBest, best: Math.max(store.best(), game.score) });
      logGame('finish');
    }

    function apply(next: TetrisState): void {
      if (next === store.game()) return;
      if (next.over) finish(next);
      else patchState(store, { game: next });
    }

    function once(action: TetrisAction): TetrisState {
      const game = store.game();
      switch (action) {
        case 'left': return move(game, -1);
        case 'right': return move(game, 1);
        case 'down': return softDrop(game);
        case 'rotate': return rotate(game, 1);
        case 'rotateCcw': return rotate(game, -1);
        case 'hardDrop': return hardDrop(game);
        case 'hold': return holdPiece(game);
      }
    }

    function pause(): void {
      if (store.status() !== 'running') return;
      releaseAll();
      write(GAME_KEY, JSON.stringify(store.game()));
      patchState(store, { status: 'paused' });
    }

    return {
      newGame(): void {
        releaseAll();
        write(GAME_KEY, null);
        patchState(store, { game: createGame(newSeed()), status: 'running', newBest: false });
        logGame('start');
      },

      pause,

      resume(): void {
        if (store.status() === 'paused') patchState(store, { status: 'running' });
      },

      togglePause(): void {
        if (store.status() === 'running') pause();
        else if (store.status() === 'paused') patchState(store, { status: 'running' });
      },

      /** One step, e.g. a swipe crossing a cell or a tap. */
      act(action: TetrisAction): void {
        if (store.status() === 'running') apply(once(action));
      },

      /** A key or button went down. Held inputs then repeat in `frame()` until `release()`. */
      press(action: TetrisAction): void {
        if (store.status() !== 'running') return;
        apply(once(action));
        if (action === 'left' || action === 'right' || action === 'down') {
          store._held.set(action, performance.now() + (action === 'down' ? SOFT_MS : DAS_MS));
          if (action !== 'down') store._lastHorizontal.dir = action;
        }
      },

      release(action: TetrisAction): void {
        if (action !== 'left' && action !== 'right' && action !== 'down') return;
        store._held.delete(action);
        if (store._lastHorizontal.dir === action) {
          const other = action === 'left' ? 'right' : 'left';
          store._lastHorizontal.dir = store._held.has(other) ? other : null;
        }
      },

      /** Called by the page once per animation frame. */
      frame(dtMs: number, now: number): void {
        if (store.status() !== 'running') return;
        let game = store.game();

        const horizontal = store._lastHorizontal.dir;
        for (const [dir, due] of store._held) {
          if (dir !== 'down' && dir !== horizontal) continue;
          let next = due;
          while (now >= next && !game.over) {
            game = dir === 'left' ? move(game, -1) : dir === 'right' ? move(game, 1) : softDrop(game);
            next += dir === 'down' ? SOFT_MS : ARR_MS;
          }
          store._held.set(dir, next);
        }

        apply(tick(game, Math.min(dtMs, MAX_FRAME_MS)));
      },
    };
  }),
);
