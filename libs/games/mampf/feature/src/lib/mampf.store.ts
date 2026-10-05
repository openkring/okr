import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  DEFAULT_MAMPF_SETTINGS,
  EngineStatus,
  GameState,
  MAMPF_I18N_KEYS,
  MAMPF_SETTINGS_KEY,
  MampfI18n,
  MampfSettings,
  START_LIVES,
  parseMampfSettings,
} from '@okr/games-mampf-util';

/** `idle` = no game started yet; `paused` is the page's, the rest mirror the engine. */
export type MampfStatus = 'idle' | 'paused' | EngineStatus;

export type MampfStoreState = {
  status: MampfStatus;
  score: number;
  level: number;
  lives: number;
  highScore: number;
  /** This game has beaten the stored high score. */
  newHigh: boolean;
  muted: boolean;
  dpad: boolean;
  /** The d-pad was switched by hand; until then it follows the pointer type and is not stored. */
  dpadChosen: boolean;
};

function readSettings(): MampfSettings {
  try {
    return parseMampfSettings(localStorage.getItem(MAMPF_SETTINGS_KEY));
  } catch {
    return DEFAULT_MAMPF_SETTINGS;
  }
}

function writeSettings(settings: MampfSettings): void {
  try {
    localStorage.setItem(MAMPF_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // private mode or blocked storage: nothing is remembered
  }
}

/**
 * The HUD side of Mampf — status, score, level, lives, high score and the two toggles.
 *
 * The game itself (`GameState`) is NOT in here: it lives on the page, is mutated in place 60
 * times a second by `step()`, and only reaches this store through `sync()` when something the
 * HUD shows has changed. That keeps change detection out of the game loop.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const MampfStore = signalStore(
  withState<MampfStoreState>(() => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const saved = browser ? readSettings() : DEFAULT_MAMPF_SETTINGS;
    const coarse = browser && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return {
      status: 'idle',
      score: 0,
      level: 1,
      lives: START_LIVES,
      highScore: saved.highScore,
      newHigh: false,
      muted: saved.muted,
      dpad: saved.dpad ?? coarse,
      dpadChosen: saved.dpad !== null,
    };
  }),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(MAMPF_I18N_KEYS) as MampfI18n,
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
  })),

  withMethods(store => {
    function persist(): void {
      if (!store._browser) return;
      writeSettings({
        highScore: store.highScore(),
        muted: store.muted(),
        dpad: store.dpadChosen() ? store.dpad() : null,
      });
    }

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('mampf', action, store._appStore.currentUser);
    }

    return {
      persist,

      /** A new game starts: forget the previous game's record flag. */
      begin(): void {
        patchState(store, { newHigh: false });
        logGame('start');
      },

      /** Copies what the HUD shows from the running game; stores the high score at game over. */
      sync(game: GameState): void {
        const ended = game.status === 'gameOver' && store.status() !== 'gameOver';
        const high = game.score > store.highScore();
        patchState(store, {
          status: game.status,
          score: game.score,
          level: game.level,
          lives: game.lives,
          ...(high ? { highScore: game.score, newHigh: true } : {}),
        });
        if (game.status === 'gameOver') persist();
        if (ended) logGame('finish');
      },

      markPaused(): void {
        patchState(store, { status: 'paused' });
        persist();
      },

      toggleMute(): void {
        patchState(store, { muted: !store.muted() });
        persist();
      },

      toggleDpad(): void {
        patchState(store, { dpad: !store.dpad(), dpadChosen: true });
        persist();
      },
    };
  }),
);
