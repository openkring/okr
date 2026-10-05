import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  CHESS_I18N_KEYS, ChessI18n, ChessSettings, ClockState, Color, DEFAULT_SETTINGS, GameResult,
  LEVEL_BUDGET_MS, Level, Move, PieceLetters, PieceType, START_FEN, SavedGame, Square,
  capturedPieces, chooseMove, colorOf, createClock, flagged, fromUci, gameResult, hasMatingMaterial,
  inCheck, isChessSettings, kingSquare, legalMoves, materialBalance, opponent, parseFen,
  parseSavedGame, pauseClock, positionKey, pressClock, replay, toFen, toSan, toUci, undoLength,
} from '@okr/games-chess-util';

import type { ChessWorkerReply, ChessWorkerRequest } from './chess.worker.protocol';

type GameFields = Pick<ChessStoreState,
  'settings' | 'initialFen' | 'uci' | 'selected' | 'promotion' | 'hintMove' | 'thinking' | 'hinting' | 'clock' | 'ended'>;

export type ChessStoreState = {
  settings: ChessSettings;
  initialFen: string;
  /** The game: UCI moves, oldest first. The single source of truth — positions are replayed. */
  uci: string[];
  selected: Square | null;
  /** A pawn move waiting for the person to pick the promotion piece. */
  promotion: { from: Square; to: Square } | null;
  /** Named `hintMove` in state (not `hint`) to avoid colliding with the `hint()` method below —
   *  a state field and a method with the same name break signalStore's declaration emit (TS4023). */
  hintMove: { from: Square; to: Square } | null;
  thinking: boolean;
  hinting: boolean;
  clock: ClockState | null;
  /** Ends the store decides: resignation, agreement, flag fall. */
  ended: GameResult | null;
  /** Clock display time, refreshed by the tick. */
  now: number;
  storageOk: boolean;
  workerFailed: boolean;
};

type Ask = Omit<ChessWorkerRequest, 'id'>;

const SETTINGS_KEY = 'chess.settings';
const GAME_KEY = 'chess.game';
/** The computer answers no faster than this, so its move reads as a move and not a flicker. */
const MIN_THINK_MS = 450;
const HINT_BUDGET_MS = 1000;
/** Main-thread fallback: capped so a phone never freezes for long. */
const FALLBACK_BUDGET_MS = 500;
const TICK_MS = 100;

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function freshGame(settings: ChessSettings): GameFields {
  return {
    settings,
    initialFen: START_FEN,
    uci: [],
    selected: null,
    promotion: null,
    hintMove: null,
    thinking: false,
    hinting: false,
    clock: settings.mode === 'human' && settings.clock ? createClock(settings.clock) : null,
    ended: null,
  };
}

/** True if a game is saved, i.e. opening the page restores it (finished or not) rather than starting a new one. */
function hasSavedGame(): boolean {
  return parseSavedGame(readJson(GAME_KEY)) !== null;
}

function initialState(): ChessStoreState {
  const extras = { now: Date.now(), storageOk: true, workerFailed: false };
  const saved = parseSavedGame(readJson(GAME_KEY));
  if (saved) {
    return {
      ...freshGame(saved.settings),
      initialFen: saved.initialFen,
      uci: saved.moves,
      clock: saved.clock,
      ended: saved.ended,
      ...extras,
    };
  }
  const settings = readJson(SETTINGS_KEY);
  return { ...freshGame(isChessSettings(settings) ? settings : DEFAULT_SETTINGS), ...extras };
}

/**
 * One game of chess against the computer or a second person at the same device.
 *
 * The computer searches in a Web Worker (`chess.worker.ts`). If the worker cannot start or
 * fails, the search falls back to the main thread at a capped strength and the page shows a note
 * (spec §5.1). A search cannot be interrupted from outside, so cancelling (undo, new game, leaving
 * the page) terminates the worker; a fresh one is created on the next request. Every computer
 * answer carries the `generation` it was asked for and is dropped if the game moved on.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const ChessStore = signalStore(
  withState<ChessStoreState>(initialState),

  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
    i18n: inject(I18nService).translateAll(CHESS_I18N_KEYS) as ChessI18n,
    _engine: {
      worker: null as Worker | null,
      seq: 0,
      generation: 0,
      pending: new Map<number, { req: Ask; resolve: (uci: string | null) => void }>(),
      tick: undefined as ReturnType<typeof setInterval> | undefined,
    },
  })),

  withComputed(store => {
    // replay() cannot fail here: only legal moves are ever appended, and saves are validated.
    const game = computed(() => replay(store.initialFen(), store.uci()) ?? replay(START_FEN, [])!);
    const current = computed(() => game().positions[game().positions.length - 1]);
    const result = computed<GameResult | null>(() => store.ended() ?? gameResult(game().positions));
    const isHuman = (c: Color) => store.settings().mode === 'human' || c === store.settings().human;
    const legal = computed(() => (result() ? [] : legalMoves(current())));
    const letters = computed<PieceLetters>(() => ({
      k: store.i18n.letter_k(), q: store.i18n.letter_q(), r: store.i18n.letter_r(),
      b: store.i18n.letter_b(), n: store.i18n.letter_n(),
    }));
    return {
      game,
      current,
      result,
      legal,
      humanTurn: computed(() => !result() && !store.thinking() && isHuman(current().turn)),
      lastMove: computed(() => {
        const moves = game().moves;
        const m = moves[moves.length - 1];
        return m ? { from: m.from, to: m.to } : null;
      }),
      checkSquare: computed(() => (inCheck(current()) ? kingSquare(current().board, current().turn) : null)),
      san: computed(() => game().moves.map((m, i) => toSan(game().positions[i], m, letters()))),
      captures: computed(() => capturedPieces(game().moves)),
      balance: computed(() => materialBalance(current().board)),
      flipped: computed(() => {
        const s = store.settings();
        return s.mode === 'human' ? s.autoFlip && current().turn === 'b' : s.human === 'b';
      }),
      canUndo: computed(() => {
        if (result() || store.promotion()) return false;
        const s = store.settings();
        return undoLength(store.uci().length, game().positions[0].turn, s.mode === 'human' ? null : s.human) !== null;
      }),
      targets: computed(() => {
        const sel = store.selected();
        return sel === null ? [] : legal().filter(m => m.from === sel).map(m => m.to);
      }),
      movable: computed(() => [...new Set(legal().map(m => m.from))]),
    };
  }),

  withMethods(store => {
    const isHuman = (c: Color) => store.settings().mode === 'human' || c === store.settings().human;

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('chess', action, store._appStore.currentUser);
    }

    function save(): void {
      const clock = store.clock();
      const game: SavedGame = {
        v: 1,
        initialFen: store.initialFen(),
        moves: store.uci(),
        settings: store.settings(),
        clock: clock ? pauseClock(clock, Date.now()) : null,
        ended: store.ended(),
      };
      const ok = writeJson(GAME_KEY, game) && writeJson(SETTINGS_KEY, store.settings());
      if (ok !== store.storageOk()) patchState(store, { storageOk: ok });
    }

    /** positionKey() of every position before the current one — the search's repetition memory. */
    function history(): string[] {
      return store.game().positions.slice(0, -1).map(positionKey);
    }

    function fallback(req: Ask): Promise<string | null> {
      return new Promise(resolve => setTimeout(() => {
        try {
          const level: Level = req.level === 'hard' ? 'medium' : req.level;
          const move = chooseMove(parseFen(req.fen), {
            level, budgetMs: Math.min(req.budgetMs, FALLBACK_BUDGET_MS), history: req.history,
          });
          resolve(move ? toUci(move) : null);
        } catch {
          // The search failed on the main thread too: never leave the caller waiting forever.
          resolve(null);
        }
      }, 0));
    }

    function failWorker(): void {
      store._engine.worker?.terminate();
      store._engine.worker = null;
      patchState(store, { workerFailed: true });
      const waiting = [...store._engine.pending.values()];
      store._engine.pending.clear();
      for (const p of waiting) void fallback(p.req).then(p.resolve);
    }

    function worker(): Worker | null {
      if (store._engine.worker || store.workerFailed()) return store._engine.worker;
      try {
        // Keep this a relative literal: Angular's bundler only recognises this exact shape.
        const w = new Worker(new URL('./chess.worker', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<ChessWorkerReply>) => {
          const p = store._engine.pending.get(e.data.id);
          if (!p) return;
          store._engine.pending.delete(e.data.id);
          if (e.data.error) {
            // The worker's deterministic search failed too; the page shows the fallback note.
            patchState(store, { workerFailed: true });
            void fallback(p.req).then(p.resolve);
          } else {
            p.resolve(e.data.move);
          }
        };
        w.onerror = () => failWorker();
        store._engine.worker = w;
        return w;
      } catch {
        failWorker();
        return null;
      }
    }

    function ask(req: Ask): Promise<string | null> {
      const w = worker();
      if (!w) return fallback(req);
      const id = ++store._engine.seq;
      return new Promise(resolve => {
        store._engine.pending.set(id, { req, resolve });
        w.postMessage({ ...req, id } satisfies ChessWorkerRequest);
      });
    }

    /** Stops whatever the engine does for this game; late answers are dropped. */
    function cancelEngine(): void {
      store._engine.generation++;
      if (store._engine.pending.size) {
        store._engine.worker?.terminate();
        store._engine.worker = null;
        store._engine.pending.clear();
      }
      patchState(store, { thinking: false, hinting: false });
    }

    function maybeComputer(): void {
      const s = store.settings();
      const pos = store.current();
      if (store.result() || s.mode === 'human' || isHuman(pos.turn)) return;
      const level = s.mode;
      const generation = store._engine.generation;
      const started = Date.now();
      patchState(store, { thinking: true });
      void ask({ fen: toFen(pos), history: history(), level, budgetMs: LEVEL_BUDGET_MS[level] }).then(uci => {
        const wait = Math.max(0, MIN_THINK_MS - (Date.now() - started));
        setTimeout(() => {
          if (generation !== store._engine.generation) return;
          patchState(store, { thinking: false });
          let move = uci ? fromUci(store.current(), uci) : null;
          // No (legal) answer, but the game isn't over: never let the board lock up — spec §5.1.
          if (!move && !store.result() && store.legal().length) {
            const legal = store.legal();
            move = legal[Math.floor(Math.random() * legal.length)];
          }
          if (move) commit(move);
        }, wait);
      });
    }

    function commit(move: Move): void {
      const mover = store.current().turn;
      const now = Date.now();
      const clock = store.clock();
      patchState(store, {
        uci: [...store.uci(), toUci(move)],
        selected: null,
        promotion: null,
        hintMove: null,
        clock: clock ? pressClock(clock, mover, now) : null,
        now,
      });
      const after = store.clock();
      if (store.result() && after) patchState(store, { clock: pauseClock(after, now) });
      // Only legal moves reach here, so the game was still open before this one.
      if (store.result()) logGame('finish');
      save();
      maybeComputer();
    }

    function finish(ended: GameResult): void {
      cancelEngine();
      const clock = store.clock();
      patchState(store, {
        ended, selected: null, promotion: null, hintMove: null,
        clock: clock ? pauseClock(clock, Date.now()) : null,
      });
      save();
      logGame('finish');
    }

    /** A tap or drop on `to` with a piece selected: move, ask for the promotion, or deselect. */
    function tryMove(to: Square): void {
      const from = store.selected();
      const candidates = from === null ? [] : store.legal().filter(m => m.from === from && m.to === to);
      if (candidates.length === 0) patchState(store, { selected: null });
      else if (candidates.length > 1) patchState(store, { promotion: { from: from as Square, to } });
      else commit(candidates[0]);
    }

    function onTick(): void {
      const clock = store.clock();
      if (!clock || clock.running === null || store.result()) return;
      const now = Date.now();
      const out = flagged(clock, now);
      if (!out) {
        patchState(store, { now });
        return;
      }
      const winner = opponent(out);
      finish(hasMatingMaterial(store.current().board, winner)
        ? { kind: 'timeout', winner, by: out }
        : { kind: 'timeout', winner: null, by: out });
      patchState(store, { now });
    }

    return {
      /** A press on a square: select an own movable piece, or try to move the selected one there. */
      pick(sq: Square): void {
        if (!store.humanTurn() || store.promotion()) return;
        const piece = store.current().board[sq];
        if (piece && colorOf(piece) === store.current().turn && store.legal().some(m => m.from === sq)) {
          patchState(store, { selected: sq });
          return;
        }
        tryMove(sq);
      },

      /** A dragged piece released on `sq`. */
      drop(sq: Square): void {
        if (store.humanTurn() && !store.promotion()) tryMove(sq);
      },

      promote(type: PieceType): void {
        const p = store.promotion();
        if (!p) return;
        const move = store.legal().find(m => m.from === p.from && m.to === p.to && m.promotion === type);
        if (move) commit(move);
        else patchState(store, { promotion: null });
      },

      cancelPromotion(): void {
        patchState(store, { promotion: null, selected: null });
      },

      /** Two people: one half-move back. Against the computer: back to the person's own turn. */
      undo(): void {
        if (!store.canUndo()) return;
        const s = store.settings();
        const keep = undoLength(store.uci().length, store.game().positions[0].turn, s.mode === 'human' ? null : s.human);
        if (keep === null) return;
        cancelEngine();
        const clock = store.clock();
        patchState(store, {
          uci: store.uci().slice(0, keep),
          selected: null, promotion: null, hintMove: null,
          clock: clock ? pauseClock(clock, Date.now()) : null,
        });
        save();
        maybeComputer();
      },

      hint(): void {
        if (!store.humanTurn() || store.hinting()) return;
        const fen = toFen(store.current());
        patchState(store, { hinting: true, hintMove: null });
        void ask({ fen, history: history(), level: 'medium', budgetMs: HINT_BUDGET_MS }).then(uci => {
          // the person may have moved meanwhile: a hint for an old position is dropped
          const same = toFen(store.current()) === fen;
          const move = same && uci ? fromUci(store.current(), uci) : null;
          patchState(store, { hinting: false, hintMove: move ? { from: move.from, to: move.to } : null });
        });
      },

      resign(): void {
        if (store.result()) return;
        const s = store.settings();
        const by = s.mode === 'human' ? store.current().turn : s.human;
        finish({ kind: 'resign', winner: opponent(by), by });
      },

      agreeDraw(): void {
        if (!store.result() && store.settings().mode === 'human') finish({ kind: 'agreement', winner: null });
      },

      newGame(settings: ChessSettings = store.settings()): void {
        cancelEngine();
        patchState(store, freshGame(settings));
        save();
        logGame('start');
        maybeComputer();
      },

      /** Board turning in two-person mode — display only, the game goes on. */
      setAutoFlip(autoFlip: boolean): void {
        patchState(store, { settings: { ...store.settings(), autoFlip } });
        save();
      },

      _tick: onTick,
      _start: maybeComputer,
      _dispose(): void {
        cancelEngine();
        store._engine.worker?.terminate();
        store._engine.worker = null;
      },
    };
  }),

  withHooks(store => ({
    onInit(): void {
      // Without a saved game the page opens on a new one: that is a start too. A restored game
      // was already logged when it began.
      if (store._browser && !hasSavedGame()) {
        store._activityService.logGame('chess', 'start', store._appStore.currentUser);
      }
      store._engine.tick = setInterval(() => store._tick(), TICK_MS);
      // The computer opens when the person plays black, and a restored game may wait for it.
      store._start();
    },
    onDestroy(): void {
      clearInterval(store._engine.tick);
      store._dispose();
    },
  })),
);
