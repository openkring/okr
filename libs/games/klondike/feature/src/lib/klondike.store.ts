import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  DrawCount,
  KLONDIKE_BEST_KEY,
  KLONDIKE_GAME_KEY,
  KLONDIKE_I18N_KEYS,
  KlondikeBest,
  KlondikeI18n,
  KlondikeState,
  Source,
  Target,
  bestTarget,
  canAutoFinish,
  canMove,
  deal,
  draw,
  formatDuration,
  isNewBest,
  isWon,
  move,
  movingCards,
  nextAutoFinishMove,
  parseBest,
  parseGame,
  recycle,
  serializeBest,
  serializeGame,
} from '@okr/games-klondike-util';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it.
 */
export type StatusPart = {
  key: keyof typeof KLONDIKE_I18N_KEYS;
  params?: Record<string, string | number>;
};

export type KlondikeStoreState = {
  game: KlondikeState;
  /** The draw rule the next game is dealt with. */
  drawNext: DrawCount;
  /** Earlier positions for undo; the move count is not taken back from them. */
  history: KlondikeState[];
  /** Playing time banked so far; the stretch since `runningSince` comes on top. */
  elapsedMs: number;
  /** When the clock was last started; null while it stands (before the first move, paused, won). */
  runningSince: number | null;
  /** Set once a second by the page, so the time on screen ticks. */
  now: number;
  won: boolean;
  newBest: boolean;
  best: KlondikeBest;
  selected: Source | null;
  autoFinishing: boolean;
  status: StatusPart | null;
};

const DEFAULT_DRAW: DrawCount = 1;

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

function freshFields(drawCount: DrawCount): Pick<KlondikeStoreState,
  'game' | 'drawNext' | 'history' | 'elapsedMs' | 'runningSince' | 'now' | 'won' | 'newBest' | 'selected' | 'autoFinishing' | 'status'> {
  return {
    game: deal(drawCount),
    drawNext: drawCount,
    history: [],
    elapsedMs: 0,
    runningSince: null,
    now: Date.now(),
    won: false,
    newBest: false,
    selected: null,
    autoFinishing: false,
    status: null,
  };
}

/** The saved game if there is an unfinished one, otherwise a fresh deal. */
function initialState(browser: boolean): KlondikeStoreState {
  const saved = browser ? parseGame(read(KLONDIKE_GAME_KEY)) : null;
  const best = browser ? parseBest(read(KLONDIKE_BEST_KEY)) : {};
  if (saved && !saved.won) {
    return { ...freshFields(saved.drawNext), game: saved.state, elapsedMs: saved.elapsedMs, best };
  }
  return { ...freshFields(saved?.drawNext ?? DEFAULT_DRAW), best };
}

const sameSource = (a: Source, b: Source): boolean =>
  a.kind === b.kind
  && (a.kind === 'waste' || a.index === (b as { index: number }).index)
  && (a.kind !== 'tableau' || a.card === (b as { card: number }).card);

/** A tapped card as a place to put the selection down; the waste never takes cards. */
function asTarget(source: Source): Target | null {
  return source.kind === 'waste' ? null : { kind: source.kind, index: source.index };
}

/**
 * Patience (Klondike), played locally. The pure rules live in `@okr/games-klondike-util`; this
 * store keeps the running game, an undo stack of earlier states, the selection and the clock,
 * and mirrors the game into `localStorage` after every move so a reload resumes it.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const KlondikeStore = signalStore(
  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    i18n: inject(I18nService).translateAll(KLONDIKE_I18N_KEYS) as KlondikeI18n,
  })),

  withState<KlondikeStoreState>(() => initialState(isPlatformBrowser(inject(PLATFORM_ID)))),

  withComputed(store => {
    const elapsed = computed((): number => {
      const since = store.runningSince();
      return store.elapsedMs() + (since === null ? 0 : Math.max(0, store.now() - since));
    });
    return {
      elapsed,
      canAutoFinish: computed((): boolean => !store.won() && !store.autoFinishing() && canAutoFinish(store.game())),

      statusText: computed((): string => {
        const i18n = store.i18n;
        if (store.won()) {
          const params = { time: formatDuration(store.elapsedMs()), moves: store.game().moves };
          return fill((store.newBest() ? i18n.status_won_best : i18n.status_won)(), params);
        }
        const part = store.status();
        if (part) return fill(i18n[part.key](), part.params ?? {});
        return store.selected() ? i18n.status_selected() : i18n.status_play();
      }),

      statsText: computed((): string => {
        const i18n = store.i18n;
        const stats = fill(i18n.status_stats(), { moves: store.game().moves, time: formatDuration(elapsed()) });
        const best = store.best()[String(store.game().drawCount) as '1' | '3'];
        return best === undefined ? stats : `${stats} · ${fill(i18n.status_best(), { time: formatDuration(best) })}`;
      }),
    };
  }),

  withMethods(store => {
    function persist(): void {
      if (!store._browser) return;
      write(KLONDIKE_GAME_KEY, serializeGame({
        state: store.game(),
        elapsedMs: store.elapsed(),
        drawNext: store.drawNext(),
        won: store.won(),
      }));
    }

    function finish(): void {
      const ms = store.elapsed();
      const drawCount = store.game().drawCount;
      const newBest = isNewBest(store.best(), drawCount, ms);
      const best = newBest ? { ...store.best(), [String(drawCount)]: ms } : store.best();
      patchState(store, { won: true, elapsedMs: ms, runningSince: null, newBest, best, autoFinishing: false, selected: null });
      if (newBest && store._browser) write(KLONDIKE_BEST_KEY, serializeBest(best));
    }

    /** Takes a new position: pushes the old one for undo, starts the clock on the first move. */
    function commit(next: KlondikeState): void {
      if (next === store.game()) return;
      const now = Date.now();
      patchState(store, {
        history: [...store.history(), store.game()],
        game: next,
        selected: null,
        status: null,
        now,
        runningSince: store.runningSince() ?? now,
      });
      if (isWon(next)) finish();
      persist();
    }

    const busy = (): boolean => store.won() || store.autoFinishing();

    return {
      newGame(drawCount: DrawCount = store.drawNext()): void {
        patchState(store, freshFields(drawCount));
        persist();
      },

      /** The draw rule applies to the next game; an untouched deal is simply redealt. */
      setDrawNext(drawCount: DrawCount): void {
        if (drawCount === store.drawNext()) return;
        if (store.game().moves === 0 && !store.won()) {
          patchState(store, freshFields(drawCount));
        } else {
          patchState(store, { drawNext: drawCount, status: { key: 'status_draw_next' } });
        }
        persist();
      },

      tapStock(): void {
        if (busy()) return;
        const game = store.game();
        commit(game.stock.length ? draw(game) : recycle(game));
      },

      /**
       * Without a selection, a tap sends the card where it fits best, or selects it when it fits
       * nowhere. With a selection, a tap on a pile that takes it moves it there; a tap on the
       * selected card drops the selection; any other tap selects the tapped card instead.
       */
      tapCard(source: Source): void {
        if (busy()) return;
        const game = store.game();
        const selected = store.selected();
        if (selected) {
          const target = asTarget(source);
          if (target && canMove(game, selected, target)) {
            commit(move(game, selected, target));
            return;
          }
          if (sameSource(selected, source)) {
            patchState(store, { selected: null, status: null });
            return;
          }
        } else {
          const to = bestTarget(game, source);
          if (to) {
            commit(move(game, source, to));
            return;
          }
        }
        patchState(store, { selected: movingCards(game, source).length ? source : null, status: null });
      },

      /** A tap on an empty column or an empty foundation. */
      tapPile(target: Target): void {
        if (busy()) return;
        const selected = store.selected();
        if (selected && canMove(store.game(), selected, target)) commit(move(store.game(), selected, target));
        else patchState(store, { selected: null });
      },

      /** A drag that ended over a pile; false when the move is not allowed (the card snaps back). */
      drop(from: Source, to: Target): boolean {
        if (busy() || !canMove(store.game(), from, to)) return false;
        commit(move(store.game(), from, to));
        return true;
      },

      undo(): void {
        const history = store.history();
        if (busy() || !history.length) return;
        const previous = history[history.length - 1];
        patchState(store, {
          game: { ...previous, moves: store.game().moves },
          history: history.slice(0, -1),
          selected: null,
          status: null,
        });
        persist();
      },

      /** Plays every remaining card home, one every `delayMs`. */
      autoFinish(delayMs: number): void {
        if (!store.canAutoFinish()) return;
        patchState(store, { autoFinishing: true, selected: null });
        const step = (): void => {
          if (!store.autoFinishing()) return; // a new game stopped it
          const next = nextAutoFinishMove(store.game());
          if (!next) {
            patchState(store, { autoFinishing: false });
            return;
          }
          commit(move(store.game(), next.from, next.to));
          if (!store.won()) setTimeout(step, delayMs);
        };
        step();
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
    };
  }),
);
