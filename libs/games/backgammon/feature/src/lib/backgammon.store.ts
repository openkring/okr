import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import {
  BACKGAMMON_I18N_KEYS,
  BackgammonI18n,
  BgFrom,
  BgState,
  BgStep,
  BgTo,
  Difficulty,
  Player,
  applyStep,
  canEndTurn,
  chooseTurn,
  createGame,
  endTurn,
  legalSteps,
  roll,
} from '@okr/games-backgammon-util';

/** Who the other side is: one of the computer levels, or a second person at the same device. */
export type BackgammonMode = Difficulty | 'human';

/** The turn the other side played last, shown as notation under the status line. */
export type BackgammonLastTurn = { player: Player; steps: BgStep[] };

export type BackgammonStoreState = {
  mode: BackgammonMode;
  /** The colour the person plays against the computer; ignored in two-player mode. */
  human: Player;
  game: BgState;
  /**
   * The positions of the current turn since the dice were rolled, newest last. Undo pops it —
   * never further back, because going back past the roll would let a player roll again.
   */
  turn: BgState[];
  /** The steps that led to each entry of `turn` after the first. */
  steps: BgStep[];
  /** The point (or the bar) picked up, waiting for its target. */
  selected: BgFrom | null;
  /** True while the computer is rolling, choosing or playing its steps. */
  thinking: boolean;
  /** The opening roll as `[white, black]`, shown until the first turn ends. */
  opening: readonly number[] | null;
  lastTurn: BackgammonLastTurn | null;
  /** Points won in this sitting; reset when the opponent or the colour changes. */
  score: Record<Player, number>;
};

/** Remembered per browser, so the next game opens with the same opponent and colour. */
const SETTINGS_KEY = 'backgammon.settings';

/** The computer rolls, then waits this long before its first step, so the dice can be read. */
const THINK_MS = 650;
/** …and plays its steps one at a time, so each one is visible as a move. */
const STEP_MS = 420;

function readSettings(): Pick<BackgammonStoreState, 'mode' | 'human'> {
  const fallback = { mode: 'medium' as BackgammonMode, human: 'W' as Player };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    const modeOk = ['easy', 'medium', 'hard', 'human'].includes(saved?.mode);
    const humanOk = saved?.human === 'W' || saved?.human === 'B';
    return modeOk && humanOk ? { mode: saved.mode, human: saved.human } : fallback;
  } catch {
    return fallback;
  }
}

function writeSettings(mode: BackgammonMode, human: Player): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, human }));
  } catch {
    // private mode or blocked storage: the settings simply are not remembered
  }
}

function freshGame(mode: BackgammonMode, human: Player, score: Record<Player, number>): BackgammonStoreState {
  const game = createGame();
  return {
    mode, human, game,
    turn: [game],
    steps: [],
    selected: game.bar[game.turn] > 0 ? 'bar' : null,
    thinking: false,
    opening: game.rolled,
    lastTurn: null,
    score,
  };
}

/**
 * One game of backgammon against the computer or a second person, in memory.
 *
 * A person plays a turn step by step — pick a checker, pick its target — and confirms it with
 * «Zug beenden» once no die is left to play. Until then every step can be taken back. The
 * computer chooses its whole turn at once (on the main thread, like Mühle: the strongest level
 * needs well under 100 ms) and then plays it one step at a time.
 *
 * Every scheduled computer action carries the `generation` it was started for and is dropped
 * once a restart has moved the generation on.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const BackgammonStore = signalStore(
  withState<BackgammonStoreState>(() => {
    const { mode, human } = readSettings();
    return freshGame(mode, human, { W: 0, B: 0 });
  }),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(BACKGAMMON_I18N_KEYS) as BackgammonI18n,
    _timer: { handle: undefined as ReturnType<typeof setTimeout> | undefined, generation: 0 },
  })),

  withComputed(store => {
    const isHuman = (p: Player) => store.mode() === 'human' || p === store.human();
    const legal = computed(() => legalSteps(store.game()));
    const humanTurn = computed(() => !store.game().result && !store.thinking() && isHuman(store.game().turn));
    return {
      legal,
      humanTurn,
      /** The person still has to roll. */
      canRoll: computed(() => humanTurn() && store.game().rolled.length === 0),
      canEndTurn: computed(() => humanTurn() && canEndTurn(store.game())),
      canUndo: computed(() => humanTurn() && store.turn().length > 1),
    };
  }),

  withMethods(store => {
    const isHuman = (p: Player) => store.mode() === 'human' || p === store.human();
    const later = (ms: number, generation: number, run: () => void) => {
      store._timer.handle = setTimeout(() => {
        if (generation === store._timer.generation) run();
      }, ms);
    };

    function cancelComputer(): void {
      clearTimeout(store._timer.handle);
      store._timer.handle = undefined;
      store._timer.generation++;
    }

    /** Re-selects the bar while checkers wait there, since nothing else may move. */
    const autoSelect = (game: BgState): BgFrom | null => (game.bar[game.turn] > 0 && legalSteps(game).length ? 'bar' : null);

    function play(step: BgStep): void {
      const game = applyStep(store.game(), step);
      patchState(store, {
        game,
        turn: [...store.turn(), game],
        steps: [...store.steps(), step],
        selected: autoSelect(game),
      });
      if (game.result) {
        const { winner, points } = game.result;
        patchState(store, {
          score: { ...store.score(), [winner]: store.score()[winner] + points },
          lastTurn: { player: winner, steps: store.steps() },
          thinking: false,
        });
      }
    }

    function finishTurn(): void {
      const player = store.game().turn;
      const game = endTurn(store.game());
      patchState(store, {
        game,
        turn: [game],
        lastTurn: { player, steps: store.steps() },
        steps: [],
        selected: null,
        opening: null,
      });
      maybeComputer();
    }

    function maybeComputer(): void {
      const start = store.game();
      const mode = store.mode();
      if (start.result || mode === 'human' || isHuman(start.turn)) return;

      const generation = ++store._timer.generation;
      const rolled = start.rolled.length ? start : roll(start);
      patchState(store, { thinking: true, game: rolled, turn: [rolled] });

      later(THINK_MS, generation, () => {
        const plan = chooseTurn(rolled, mode);
        const next = (i: number) => {
          if (store.game().result) return;
          if (i < plan.length) {
            play(plan[i]);
            later(STEP_MS, generation, () => next(i + 1));
          } else {
            patchState(store, { thinking: false });
            finishTurn();
          }
        };
        next(0);
      });
    }

    return {
      newGame(mode: BackgammonMode = store.mode(), human: Player = store.human()): void {
        cancelComputer();
        writeSettings(mode, human);
        const same = mode === store.mode() && human === store.human();
        patchState(store, freshGame(mode, human, same ? store.score() : { W: 0, B: 0 }));
        maybeComputer();
      },

      roll(): void {
        if (!store.canRoll()) return;
        const game = roll(store.game());
        patchState(store, { game, turn: [game], steps: [], selected: autoSelect(game), opening: null });
      },

      /** Every tap on a point, the bar or the bear-off tray. */
      tap(target: BgFrom | BgTo): void {
        if (!store.humanTurn() || !store.game().rolled.length) return;
        const legal = store.legal();
        const selected = store.selected();

        if (selected !== null) {
          // Bearing off may fit more than one die; the smallest one keeps the bigger for later.
          const step = legal
            .filter(s => s.from === selected && s.to === target)
            .sort((a, b) => a.die - b.die)[0];
          if (step) {
            play(step);
            return;
          }
        }
        if (target !== 'off' && legal.some(s => s.from === target)) {
          patchState(store, { selected: selected === target && target !== 'bar' ? null : target });
          return;
        }
        patchState(store, { selected: autoSelect(store.game()) });
      },

      /** One step back within the current turn. */
      undo(): void {
        if (!store.canUndo()) return;
        const turn = store.turn().slice(0, -1);
        const game = turn[turn.length - 1];
        patchState(store, { turn, game, steps: store.steps().slice(0, -1), selected: autoSelect(game) });
      },

      endTurn(): void {
        if (store.canEndTurn()) finishTurn();
      },

      _cancelComputer: cancelComputer,
      _start: maybeComputer,
    };
  }),

  withHooks(store => ({
    // The computer may have won the opening roll, in which case it opens.
    onInit: () => store._start(),
    onDestroy: () => store._cancelComputer(),
  })),
);
