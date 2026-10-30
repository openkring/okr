import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  MAHJONG_BEST_KEY,
  MAHJONG_CONFIG_KEY,
  MAHJONG_GAME_KEY,
  MAHJONG_I18N_KEYS,
  MahjongBest,
  MahjongI18n,
  MahjongLayout,
  MahjongState,
  deal,
  findPair,
  formatDuration,
  freeTiles,
  isCleared,
  isNewBest,
  matches,
  openPairs,
  parseBest,
  parseConfig,
  parseGame,
  removePair,
  reshuffle,
  serializeBest,
  serializeGame,
  tilesLeft,
} from '@okr/games-mahjong-util';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it.
 */
export type StatusPart = {
  key: keyof typeof MAHJONG_I18N_KEYS;
  params?: Record<string, string | number>;
};

export type MahjongStoreState = {
  game: MahjongState;
  /** Earlier positions for undo, shuffles included. */
  history: MahjongState[];
  /** Playing time banked so far; the stretch since `runningSince` comes on top. */
  elapsedMs: number;
  /** When the clock was last started; null while it stands (before the first move, paused, won). */
  runningSince: number | null;
  /** Set once a second by the page, so the time on screen ticks. */
  now: number;
  won: boolean;
  newBest: boolean;
  best: MahjongBest;
  selected: number | null;
  /** A pair shown by «Tipp»; cleared after a moment or by the next tap. */
  hint: [number, number] | null;
  /** The blocked tile just tapped, so the page can shake it. */
  refused: number | null;
  dimLocked: boolean;
  status: StatusPart | null;
};

const DEFAULT_LAYOUT: MahjongLayout = 'pagoda';
const HINT_MS = 1600;

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

function freshFields(layout: MahjongLayout): Pick<MahjongStoreState,
  'game' | 'history' | 'elapsedMs' | 'runningSince' | 'now' | 'won' | 'newBest' | 'selected' | 'hint' | 'refused' | 'status'> {
  return {
    game: deal(layout),
    history: [],
    elapsedMs: 0,
    runningSince: null,
    now: Date.now(),
    won: false,
    newBest: false,
    selected: null,
    hint: null,
    refused: null,
    status: null,
  };
}

/** True if an unfinished game is saved, i.e. opening the page resumes it rather than dealing a new one. */
function hasResumableGame(browser: boolean): boolean {
  const saved = browser ? parseGame(read(MAHJONG_GAME_KEY)) : null;
  return !!saved && !saved.won;
}

/** The saved game if there is an unfinished one, otherwise a fresh deal on the last layout played. */
function initialState(browser: boolean): MahjongStoreState {
  const saved = browser ? parseGame(read(MAHJONG_GAME_KEY)) : null;
  const best = browser ? parseBest(read(MAHJONG_BEST_KEY)) : {};
  const { dimLocked } = parseConfig(browser ? read(MAHJONG_CONFIG_KEY) : null);
  if (saved && !saved.won) {
    return { ...freshFields(saved.state.layout), game: saved.state, elapsedMs: saved.elapsedMs, best, dimLocked };
  }
  return { ...freshFields(saved?.state.layout ?? DEFAULT_LAYOUT), best, dimLocked };
}

/**
 * Mahjong solitaire, played locally. The pure rules live in `@okr/games-mahjong-util`; this
 * store keeps the running game, an undo stack of earlier states, the selection, a hint and the
 * clock, and mirrors the game into `localStorage` after every move so a reload resumes it.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const MahjongStore = signalStore(
  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
    _timer: { hint: undefined as ReturnType<typeof setTimeout> | undefined },
    i18n: inject(I18nService).translateAll(MAHJONG_I18N_KEYS) as MahjongI18n,
  })),

  withState<MahjongStoreState>(() => initialState(isPlatformBrowser(inject(PLATFORM_ID)))),

  withComputed(store => {
    const elapsed = computed((): number => {
      const since = store.runningSince();
      return store.elapsedMs() + (since === null ? 0 : Math.max(0, store.now() - since));
    });
    const free = computed((): ReadonlySet<number> => new Set(freeTiles(store.game())));
    const pairs = computed((): number => openPairs(store.game()));
    const stuck = computed((): boolean => !store.won() && pairs() === 0);
    return {
      elapsed,
      free,
      stuck,

      statusText: computed((): string => {
        const i18n = store.i18n;
        if (store.won()) {
          return fill((store.newBest() ? i18n.status_won_best : i18n.status_won)(), { time: formatDuration(store.elapsedMs()) });
        }
        if (stuck()) return i18n.status_stuck();
        const part = store.status();
        if (part) return fill(i18n[part.key](), part.params ?? {});
        return store.selected() === null ? i18n.status_play() : i18n.status_selected();
      }),

      statsText: computed((): string => {
        const i18n = store.i18n;
        const game = store.game();
        const stats = fill(i18n.status_stats(), { tiles: tilesLeft(game), pairs: pairs(), time: formatDuration(elapsed()) });
        const best = store.best()[game.layout];
        return best === undefined ? stats : `${stats} · ${fill(i18n.status_best(), { time: formatDuration(best) })}`;
      }),
    };
  }),

  withMethods(store => {
    function persist(): void {
      if (!store._browser) return;
      write(MAHJONG_GAME_KEY, serializeGame({ state: store.game(), elapsedMs: store.elapsed(), won: store.won() }));
    }

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('mahjong', action, store._appStore.currentUser);
    }

    function clearHint(): void {
      clearTimeout(store._timer.hint);
      store._timer.hint = undefined;
      if (store.hint()) patchState(store, { hint: null });
    }

    function finish(): void {
      const ms = store.elapsed();
      const layout = store.game().layout;
      const newBest = isNewBest(store.best(), layout, ms);
      const best = newBest ? { ...store.best(), [layout]: ms } : store.best();
      patchState(store, { won: true, elapsedMs: ms, runningSince: null, newBest, best, selected: null });
      if (newBest && store._browser) write(MAHJONG_BEST_KEY, serializeBest(best));
      logGame('finish');
    }

    /** Takes a new position: pushes the old one for undo, starts the clock on the first move. */
    function commit(next: MahjongState, status: StatusPart | null = null): void {
      if (next === store.game()) return;
      const now = Date.now();
      patchState(store, {
        history: [...store.history(), store.game()],
        game: next,
        selected: null,
        refused: null,
        status,
        now,
        runningSince: store.runningSince() ?? now,
      });
      if (isCleared(next)) finish();
      persist();
    }

    function newGame(layout: MahjongLayout = store.game().layout): void {
      clearHint();
      patchState(store, freshFields(layout));
      persist();
      logGame('start');
    }

    return {
      newGame,

      /** A new layout starts a new game. */
      setLayout(layout: MahjongLayout): void {
        if (layout !== store.game().layout) newGame(layout);
      },

      setDimLocked(dimLocked: boolean): void {
        patchState(store, { dimLocked });
        if (store._browser) write(MAHJONG_CONFIG_KEY, JSON.stringify({ dimLocked }));
      },

      /**
       * A tap on a tile. A blocked tile is refused; the first free tile is selected; a second
       * one that matches takes the pair, one that does not becomes the new selection.
       */
      tap(i: number): void {
        if (store.won() || !store.game().alive[i]) return;
        clearHint();
        if (!store.free().has(i)) {
          patchState(store, { refused: i, status: { key: 'status_blocked' } });
          return;
        }
        const selected = store.selected();
        if (selected === null) {
          patchState(store, { selected: i, refused: null, status: null });
        } else if (selected === i) {
          patchState(store, { selected: null, refused: null, status: null });
        } else if (matches(store.game().kinds[selected], store.game().kinds[i])) {
          commit(removePair(store.game(), selected, i));
        } else {
          patchState(store, { selected: i, refused: null, status: { key: 'status_no_match' } });
        }
      },

      undo(): void {
        const history = store.history();
        if (store.won() || !history.length) return;
        clearHint();
        patchState(store, {
          game: history[history.length - 1],
          history: history.slice(0, -1),
          selected: null,
          refused: null,
          status: null,
        });
        persist();
      },

      showHint(): void {
        if (store.won()) return;
        clearHint();
        const pair = findPair(store.game());
        if (!pair) return;
        patchState(store, { hint: pair, selected: null, refused: null, status: { key: 'status_hint' } });
        store._timer.hint = setTimeout(clearHint, HINT_MS);
      },

      /** Rearranges the tiles still on the board into an order that can be cleared. */
      shuffle(): void {
        if (store.won()) return;
        clearHint();
        const next = reshuffle(store.game());
        if (next) commit(next, { key: 'status_shuffled' });
      },

      /** The page left the screen: bank the running time. */
      pause(): void {
        if (store.runningSince() === null) return;
        patchState(store, { now: Date.now() });
        patchState(store, { elapsedMs: store.elapsed(), runningSince: null });
        persist();
      },

      /** The page is back: a game already under way keeps counting. */
      resume(): void {
        if (store.won() || store.runningSince() !== null || store.game().moves === 0) return;
        const now = Date.now();
        patchState(store, { runningSince: now, now });
      },

      tick(): void {
        patchState(store, { now: Date.now() });
      },

      _clearHint: clearHint,
    };
  }),

  withHooks({
    // Opening the page without a saved game deals a fresh one: that is a start too. A resumed
    // game was already logged when it was dealt.
    onInit(store) {
      if (store._browser && !hasResumableGame(store._browser)) {
        store._activityService.logGame('mahjong', 'start', store._appStore.currentUser);
      }
    },
    onDestroy(store) {
      store._clearHint();
    },
  }),
);
