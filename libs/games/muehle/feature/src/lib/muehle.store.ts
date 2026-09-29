import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import {
  Difficulty,
  MUEHLE_I18N_KEYS,
  MuehleI18n,
  MuehleMove,
  MuehleState,
  Player,
  applyMove,
  chooseMove,
  closesMill,
  createGame,
  legalMoves,
  phaseOf,
} from '@okr/games-muehle-util';

/** Who the other side is: one of the computer levels, or a second person at the same device. */
export type MuehleMode = Difficulty | 'human';

/** A step that closes a mill and now waits for the player to pick the stone to take. */
export type MuehlePending = { from: number | null; to: number };

export type MuehleStoreState = {
  mode: MuehleMode;
  /** The colour the person plays against the computer; ignored in two-player mode. */
  human: Player;
  /** Every position of this game, newest last. Undo pops it. */
  history: MuehleState[];
  /** The move that led to each entry of `history` (`null` for the opening position). */
  lastMoves: (MuehleMove | null)[];
  /** The stone picked up in the moving phase, waiting for its target. */
  selected: number | null;
  pending: MuehlePending | null;
  /** True while the computer is choosing its move. */
  thinking: boolean;
};

/** Remembered per browser, so the next game opens with the same opponent and colour. */
const SETTINGS_KEY = 'muehle.settings';

/** The computer answers no faster than this, so its move is visible as a move and not a flicker. */
const MIN_THINK_MS = 450;

function readSettings(): Pick<MuehleStoreState, 'mode' | 'human'> {
  const fallback = { mode: 'medium' as MuehleMode, human: 'W' as Player };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    const modeOk = ['easy', 'medium', 'hard', 'human'].includes(saved?.mode);
    const humanOk = saved?.human === 'W' || saved?.human === 'B';
    return modeOk && humanOk ? { mode: saved.mode, human: saved.human } : fallback;
  } catch {
    return fallback;
  }
}

function writeSettings(mode: MuehleMode, human: Player): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, human }));
  } catch {
    // private mode or blocked storage: the settings simply are not remembered
  }
}

function freshGame(mode: MuehleMode, human: Player): MuehleStoreState {
  return {
    mode, human,
    history: [createGame('W')],
    lastMoves: [null],
    selected: null,
    pending: null,
    thinking: false,
  };
}

/**
 * One game of Mühle against the computer or a second person, in memory.
 *
 * THE COMPUTER RUNS ON THE MAIN THREAD. The standalone prototype ran `chooseMove` in a Web
 * Worker built from an inline blob; a worker in a buildable lib needs a bundler-resolved URL,
 * which is exactly the kind of wiring that breaks silently here. Measured on the prototype, the
 * strongest level (depth 5) needs about 110 ms at worst on a desktop, a few hundred ms on a
 * phone — so the move is scheduled with `setTimeout` after `thinking` is set, which lets the
 * spinner paint first, and `MIN_THINK_MS` pads fast answers.
 *
 * A game that was restarted or undone while the computer was thinking must not receive the
 * stale answer: every scheduled move carries the `generation` it was asked for and is dropped
 * if the generation has moved on.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const MuehleStore = signalStore(
  withState<MuehleStoreState>(() => {
    const { mode, human } = readSettings();
    return freshGame(mode, human);
  }),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(MUEHLE_I18N_KEYS) as MuehleI18n,
    _timer: { handle: undefined as ReturnType<typeof setTimeout> | undefined, generation: 0 },
  })),

  withComputed(store => {
    const current = computed(() => store.history()[store.history().length - 1]);
    const isHuman = (p: Player) => store.mode() === 'human' || p === store.human();
    return {
      current,
      moves: computed(() => (current().result ? [] : legalMoves(current()))),
      lastMove: computed(() => store.lastMoves()[store.lastMoves().length - 1]),
      humanTurn: computed(() => !current().result && !store.thinking() && isHuman(current().turn)),
      canUndo: computed(() => store.history().length > 1),
    };
  }),

  withMethods(store => {
    const isHuman = (p: Player) => store.mode() === 'human' || p === store.human();

    function cancelComputer(): void {
      clearTimeout(store._timer.handle);
      store._timer.handle = undefined;
      store._timer.generation++;
    }

    function maybeComputer(): void {
      const state = store.current();
      const mode = store.mode();
      if (state.result || mode === 'human' || isHuman(state.turn)) return;

      patchState(store, { thinking: true });
      const generation = ++store._timer.generation;
      // Yield once so the spinner is on screen before the search blocks the thread.
      store._timer.handle = setTimeout(() => {
        const started = performance.now();
        const move = chooseMove(state, mode);
        const wait = Math.max(0, MIN_THINK_MS - (performance.now() - started));
        store._timer.handle = setTimeout(() => {
          if (generation !== store._timer.generation) return;
          patchState(store, { thinking: false });
          if (move) commit(move);
        }, wait);
      }, 0);
    }

    function commit(move: MuehleMove): void {
      patchState(store, {
        history: [...store.history(), applyMove(store.current(), move)],
        lastMoves: [...store.lastMoves(), move],
        selected: null,
        pending: null,
      });
      maybeComputer();
    }

    /** A step that either closes a mill (→ ask for the removal) or is complete on its own. */
    function step(from: number | null, to: number): void {
      if (closesMill(store.current(), from, to)) {
        patchState(store, { pending: { from, to }, selected: null });
      } else {
        commit({ from, to, remove: null });
      }
    }

    return {
      newGame(mode: MuehleMode = store.mode(), human: Player = store.human()): void {
        cancelComputer();
        writeSettings(mode, human);
        patchState(store, freshGame(mode, human));
        maybeComputer();
      },

      /** Every tap on a board point; what it means depends on the phase and on what is pending. */
      tap(point: number): void {
        if (!store.humanTurn()) return;
        const state = store.current();
        const moves = store.moves();
        const pending = store.pending();

        if (pending) {
          const removal = moves.find(m => m.from === pending.from && m.to === pending.to && m.remove === point);
          if (removal) {
            commit(removal);
          } else if (point === pending.to || point === pending.from) {
            // tapping the moved stone again takes the step back
            patchState(store, { pending: null });
          }
          return;
        }

        if (phaseOf(state) === 'placing') {
          if (state.board[point] === null) step(null, point);
          return;
        }

        const selected = store.selected();
        if (state.board[point] === state.turn) {
          const movable = moves.some(m => m.from === point);
          patchState(store, { selected: selected === point || !movable ? null : point });
          return;
        }
        if (selected !== null && moves.some(m => m.from === selected && m.to === point)) {
          step(selected, point);
          return;
        }
        patchState(store, { selected: null });
      },

      /** One move back — against the computer, back to the person's own turn. */
      undo(): void {
        cancelComputer();
        let history = store.history();
        let lastMoves = store.lastMoves();
        const pop = () => {
          if (history.length > 1) {
            history = history.slice(0, -1);
            lastMoves = lastMoves.slice(0, -1);
          }
        };
        pop();
        if (store.mode() !== 'human') {
          while (history.length > 1 && !isHuman(history[history.length - 1].turn)) pop();
        }
        patchState(store, { history, lastMoves, selected: null, pending: null, thinking: false });
        maybeComputer();
      },

      _cancelComputer: cancelComputer,
      _start: maybeComputer,
    };
  }),

  withHooks(store => ({
    // The person may have chosen black last time, in which case the computer opens.
    onInit: () => store._start(),
    onDestroy: () => store._cancelComputer(),
  })),
);
