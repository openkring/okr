import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DateFormat, convertDateFormatToString, fill, getTodayStr } from '@okr/shared-util-core';
import {
  LetterState,
  WORDLE_CONFIG_KEY,
  WORDLE_I18N_KEYS,
  WordleConfig,
  WordleGame,
  WordleI18n,
  WordleMode,
  WordleStats,
  currentStreak,
  dailyWord,
  gameStatus,
  keyboardStates,
  parseConfig,
  parseGame,
  parseStats,
  randomWord,
  recordResult,
  scoreGuess,
  shareText,
  submitGuess,
  typeInto,
  winRate,
  wordleGameKey,
  wordleStatsKey,
} from '@okr/games-wordle-util';

/** A short-lived line under the board; the page clears it after a moment. */
export type WordleNotice = 'too-short' | 'tries-next' | 'copied';

export type WordleStoreState = {
  config: WordleConfig;
  game: WordleGame;
  /** The row being typed — not yet part of `game.guesses`. */
  row: string;
  stats: WordleStats;
  /** StoreDate the page last looked at, so a page left open over midnight can deal the new daily word. */
  today: string;
  notice: WordleNotice | null;
  /** Bumped on every refused submission; the page keys its shake animation on it. */
  shake: number;
};

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
    // private mode or blocked storage: the round simply is not remembered
  }
}

/**
 * The round for the given settings: the saved one if it still applies, otherwise a fresh deal.
 *
 * - daily: the saved round of that length if it is TODAY's; else today's word with the current
 *   number of tries. A fresh daily round is not written until the first guess, so changing the
 *   tries before playing still takes effect.
 * - endless: the saved round if it has the requested length; else a random word.
 */
function loadGame(config: WordleConfig, today: string, browser: boolean): WordleGame {
  const saved = savedGame(config, today, browser);
  if (saved) return saved;
  if (config.mode === 'daily') {
    return { mode: 'daily', day: today, length: config.length, maxTries: config.maxTries, solution: dailyWord(today, config.length), guesses: [] };
  }
  return dealEndless(config);
}

/** The saved round `loadGame` would resume for these settings, or null if it deals a fresh one. */
function savedGame(config: WordleConfig, today: string, browser: boolean): WordleGame | null {
  const saved = browser ? parseGame(read(wordleGameKey(config.mode, config.length))) : null;
  if (config.mode === 'daily') return saved?.mode === 'daily' && saved.day === today ? saved : null;
  return saved?.mode === 'endless' && saved.length === config.length ? saved : null;
}

function dealEndless(config: WordleConfig, previous?: string): WordleGame {
  return { mode: 'endless', length: config.length, maxTries: config.maxTries, solution: randomWord(config.length, Math.random, previous), guesses: [] };
}

/**
 * One Wordle round over the pure `@okr/games-wordle-util` engine.
 *
 * Kept in `localStorage` (nothing goes to Firestore): the settings, the daily round per length,
 * the current endless round, and the statistics per (mode, length). All reads go through the
 * util parsers, so a broken entry starts fresh instead of locking the page.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const WordleStore = signalStore(
  withState<WordleStoreState>(() => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const config = browser ? parseConfig(read(WORDLE_CONFIG_KEY)) : parseConfig(null);
    const today = getTodayStr();
    return {
      config,
      game: loadGame(config, today, browser),
      row: '',
      stats: browser ? parseStats(read(wordleStatsKey(config.mode, config.length))) : parseStats(null),
      today,
      notice: null,
      shake: 0,
    };
  }),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(WORDLE_I18N_KEYS) as WordleI18n,
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
  })),

  withComputed(store => ({
    status: computed(() => gameStatus(store.game())),
    keys: computed((): Partial<Record<string, LetterState>> => keyboardStates(store.game())),
    /** Every row of the board: its letters (padded with '') and, once submitted, its scores. */
    rows: computed(() => {
      const game = store.game();
      const playing = gameStatus(game) === 'playing';
      return Array.from({ length: game.maxTries }, (_, i) => {
        const guess = game.guesses[i];
        const text = guess ?? (playing && i === game.guesses.length ? store.row() : '');
        return {
          letters: Array.from({ length: game.length }, (_, j) => text[j] ?? ''),
          states: guess ? scoreGuess(guess, game.solution) : null,
          current: guess === undefined && playing && i === game.guesses.length,
        };
      });
    }),
    winRate: computed(() => winRate(store.stats())),
    streak: computed(() => currentStreak(store.stats(), store.today(), store.config().mode)),
    /** The distribution as bars, 1..maxTries, each with its share of the longest bar. */
    dist: computed(() => {
      const dist = store.stats().dist;
      const tries = store.game().maxTries;
      const max = Math.max(1, ...Object.values(dist));
      return Array.from({ length: tries }, (_, i) => {
        const count = dist[i + 1] ?? 0;
        return { tries: i + 1, count, share: count / max };
      });
    }),
  })),

  withComputed(store => ({
    wonDetail: computed(() => fill(store.i18n.won_detail(), { count: store.game().guesses.length, max: store.game().maxTries })),
    lostDetail: computed(() => fill(store.i18n.lost_detail(), { word: store.game().solution })),
    noticeLabel: computed(() => {
      switch (store.notice()) {
        case 'too-short': return fill(store.i18n.too_short(), { length: store.game().length });
        case 'tries-next': return store.i18n.tries_next();
        case 'copied': return store.i18n.copied();
        default: return '';
      }
    }),
  })),

  withMethods(store => {
    function saveGame(game: WordleGame): void {
      if (store._browser) write(wordleGameKey(game.mode, game.length), JSON.stringify(game));
    }

    function saveConfig(config: WordleConfig): void {
      if (store._browser) write(WORDLE_CONFIG_KEY, JSON.stringify(config));
    }

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('wordle', action, store._appStore.currentUser);
    }

    function loadStats(config: WordleConfig): WordleStats {
      return parseStats(store._browser ? read(wordleStatsKey(config.mode, config.length)) : null);
    }

    /** Applies new settings and shows the round that belongs to them. */
    function reconfigure(config: WordleConfig): void {
      saveConfig(config);
      const fresh = !savedGame(config, store.today(), store._browser);
      patchState(store, {
        config,
        game: loadGame(config, store.today(), store._browser),
        row: '',
        stats: loadStats(config),
        notice: null,
      });
      if (fresh) logGame('start');
    }

    return {
      setMode(mode: WordleMode): void {
        if (mode !== store.config().mode) reconfigure({ ...store.config(), mode });
      },

      setLength(length: number): void {
        if (length !== store.config().length) reconfigure({ ...store.config(), length });
      },

      /**
       * A running round keeps the tries it was dealt with (see `WordleGame.maxTries`). An endless
       * round nobody has guessed in yet is re-dealt, and so is a daily round that has not started;
       * otherwise the player is told the change applies to the next word.
       */
      setTries(maxTries: number): void {
        const config = { ...store.config(), maxTries };
        saveConfig(config);
        const game = store.game();
        if (game.guesses.length === 0) {
          patchState(store, { config, game: { ...game, maxTries }, notice: null });
        } else {
          patchState(store, { config, notice: gameStatus(game) === 'playing' ? 'tries-next' : null });
        }
      },

      /** One key or typed character; umlauts are transcribed (Ä → AE). */
      type(text: string): void {
        if (gameStatus(store.game()) !== 'playing') return;
        const row = typeInto(store.row(), text, store.game().length);
        if (row !== store.row()) patchState(store, { row, notice: null });
      },

      backspace(): void {
        if (store.row().length > 0) patchState(store, { row: store.row().slice(0, -1), notice: null });
      },

      submit(): void {
        const result = submitGuess(store.game(), store.row());
        if (!result.ok) {
          if (result.reason === 'too-short') patchState(store, { notice: 'too-short', shake: store.shake() + 1 });
          return;
        }
        const game = result.game;
        saveGame(game);
        let stats = store.stats();
        if (gameStatus(game) !== 'playing') {
          stats = recordResult(stats, game);
          if (store._browser) write(wordleStatsKey(game.mode, game.length), JSON.stringify(stats));
        }
        patchState(store, { game, row: '', stats, notice: null });
        // submitGuess refuses a finished round, so this fires once, on the guess that ends it.
        if (gameStatus(game) !== 'playing') logGame('finish');
      },

      /** Endless only: deal the next random word with the current settings. */
      nextWord(): void {
        if (store.config().mode !== 'endless') return;
        const game = dealEndless(store.config(), store.game().solution);
        saveGame(game);
        patchState(store, { game, row: '', notice: null });
        logGame('start');
      },

      /**
       * Called when the page becomes visible again. If the calendar day changed meanwhile, the
       * daily mode moves on to the new word; an endless round is left alone.
       */
      refreshDay(): void {
        const today = getTodayStr();
        if (today === store.today()) return;
        patchState(store, { today });
        if (store.config().mode === 'daily') reconfigure(store.config());
      },

      /** The text to put on the clipboard for the finished round. */
      shareText(): string {
        const game = store.game();
        const headline = game.mode === 'daily' && game.day
          ? fill(store.i18n.share_daily(), { date: convertDateFormatToString(game.day, DateFormat.StoreDate, DateFormat.ViewDate, false) })
          : store.i18n.share_endless();
        return shareText(game, headline);
      },

      notify(notice: WordleNotice | null): void {
        patchState(store, { notice });
      },
    };
  }),

  withHooks({
    // Opening the page without a saved round for the current settings deals a fresh one: that is
    // a start too. A resumed round (or today's daily, already played) was logged when it was dealt.
    onInit(store) {
      if (store._browser && !savedGame(store.config(), store.today(), store._browser)) {
        store._activityService.logGame('wordle', 'start', store._appStore.currentUser);
      }
    },
  }),
);
