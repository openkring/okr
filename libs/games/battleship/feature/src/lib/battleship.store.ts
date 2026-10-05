import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  AiLevel,
  BATTLESHIP_I18N_KEYS,
  BATTLESHIP_SIZE,
  BattleshipI18n,
  Board,
  CellKnowledge,
  Coord,
  FLEET,
  FireOutcome,
  ShipId,
  aiChooseShot,
  canPlace,
  coordLabel,
  createBoard,
  fire,
  inBounds,
  knowledge,
  placeShip,
  randomFleet,
  shipCells,
} from '@okr/games-battleship-util';

export type BattleshipPhase = 'setup' | 'battle' | 'over';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it. `ship` is resolved to its translated name at render time.
 */
export type StatusPart = {
  key: keyof typeof BATTLESHIP_I18N_KEYS;
  params?: Record<string, string | number>;
  ship?: ShipId;
  /** Who fired, resolved to "Du"/"Gegner" at render time. */
  who?: 'status_you' | 'status_enemy';
};

export type BattleshipState = {
  phase: BattleshipPhase;
  allowTouch: boolean;
  extraShot: boolean;
  level: AiLevel;
  player: Board;
  enemy: Board | null;
  horizontal: boolean;
  /** Index into `FLEET` of the next ship to place. */
  placeIdx: number;
  /** The cell under the pointer during setup, for the placement preview. */
  hover: Coord | null;
  turn: 'player' | 'ai' | null;
  lastPlayerShot: Coord | null;
  lastAiShot: Coord | null;
  shots: { player: number; ai: number };
  status: StatusPart[];
};

/** Pause before each computer shot, so the person can follow what happened. */
const AI_DELAY_MS = 650;

function placePrompt(placeIdx: number): StatusPart[] {
  if (placeIdx >= FLEET.length) return [{ key: 'status_ready' }];
  const spec = FLEET[placeIdx];
  return [{ key: 'status_place', ship: spec.id, params: { len: spec.len } }];
}

/**
 * Schiffli versenken against the computer, in memory — a port of the standalone prototype
 * (`libs/games/battleship`, 2026-09) onto a signal store. Boards are immutable (see
 * `battleship.engine.ts`), so every shot is one `patchState` and the page re-renders from it.
 *
 * The computer's shots run on a timer. Leaving the page or starting over bumps `generation`,
 * which drops any shot still scheduled for the previous game.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const BattleshipStore = signalStore(
  withState<BattleshipState>({
    phase: 'setup',
    allowTouch: false,
    extraShot: true,
    level: 'hard',
    player: createBoard(),
    enemy: null,
    horizontal: true,
    placeIdx: 0,
    hover: null,
    turn: null,
    lastPlayerShot: null,
    lastAiShot: null,
    shots: { player: 0, ai: 0 },
    status: placePrompt(0),
  }),

  withProps(() => ({
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
    i18n: inject(I18nService).translateAll(BATTLESHIP_I18N_KEYS) as BattleshipI18n,
    _timer: { handle: undefined as ReturnType<typeof setTimeout> | undefined, generation: 0 },
  })),

  withComputed(store => ({
    fleetPlaced: computed((): boolean => store.placeIdx() >= FLEET.length),

    playerKnowledge: computed((): CellKnowledge[][] => knowledge(store.player(), true)),
    enemyKnowledge: computed((): CellKnowledge[][] | null => {
      const enemy = store.enemy();
      return enemy ? knowledge(enemy, store.allowTouch()) : null;
    }),

    /** Cells the next ship would occupy at the hovered cell, and whether it fits there. */
    preview: computed((): { cells: Set<number>; ok: boolean } | null => {
      const hover = store.hover();
      if (store.phase() !== 'setup' || !hover || store.placeIdx() >= FLEET.length) return null;
      const [r, c] = hover;
      const len = FLEET[store.placeIdx()].len;
      const ok = canPlace(store.player(), r, c, len, store.horizontal(), store.allowTouch());
      const cells = new Set(
        shipCells(r, c, len, store.horizontal())
          .filter(([rr, cc]) => inBounds(rr, cc))
          .map(([rr, cc]) => rr * BATTLESHIP_SIZE + cc),
      );
      return { cells, ok };
    }),

    statusText: computed((): string => store.status().map(part => {
      const params = { ...part.params };
      if (part.ship) params['ship'] = shipName(store.i18n, part.ship);
      if (part.who) params['who'] = store.i18n[part.who]();
      return fill(store.i18n[part.key](), params);
    }).join(' ')),
  })),

  withMethods(store => {
    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('battleship', action, store._appStore.currentUser);
    }

    function cancelTimer(): void {
      clearTimeout(store._timer.handle);
      store._timer.handle = undefined;
      store._timer.generation++;
    }

    function schedule(fn: () => void): void {
      const generation = store._timer.generation;
      store._timer.handle = setTimeout(() => {
        if (generation === store._timer.generation) fn();
      }, AI_DELAY_MS);
    }

    function shotPart(outcome: FireOutcome, at: Coord, who: 'status_you' | 'status_enemy'): StatusPart {
      const params = { at: coordLabel(at[0], at[1]) };
      if (outcome.result === 'miss') return { key: 'status_miss', params, who };
      if (outcome.result === 'hit') return { key: 'status_hit', params, who };
      return { key: 'status_sunk', params, who, ship: outcome.ship?.id };
    }

    function aiTurn(): void {
      if (store.phase() !== 'battle') return;
      const shot = aiChooseShot(store.player(), store.level(), store.allowTouch());
      if (!shot) return;
      const outcome = fire(store.player(), shot[0], shot[1]);
      const shots = { ...store.shots(), ai: store.shots().ai + 1 };
      patchState(store, { player: outcome.board, lastAiShot: shot, shots });

      if (outcome.gameOver) {
        patchState(store, { phase: 'over', turn: null, status: [{ key: 'status_lost', params: { shots: shots.ai } }] });
        logGame('finish');
        return;
      }
      const msg = shotPart(outcome, shot, 'status_enemy');
      if (outcome.result !== 'miss' && store.extraShot()) {
        patchState(store, { status: [msg, { key: 'status_enemy_again' }] });
        schedule(aiTurn);
        return;
      }
      patchState(store, { turn: 'player', status: [msg, { key: 'status_your_turn_short' }] });
    }

    function resetSetup(): void {
      cancelTimer();
      patchState(store, {
        phase: 'setup',
        player: createBoard(),
        enemy: null,
        placeIdx: 0,
        hover: null,
        turn: null,
        lastAiShot: null,
        lastPlayerShot: null,
        status: placePrompt(0),
      });
    }

    return {
      resetSetup,

      setAllowTouch(allowTouch: boolean): void {
        patchState(store, { allowTouch });
        // a fleet placed under the other rule may now be illegal
        resetSetup();
      },
      setExtraShot(extraShot: boolean): void {
        patchState(store, { extraShot });
      },
      setLevel(level: AiLevel): void {
        patchState(store, { level });
      },

      rotate(): void {
        patchState(store, { horizontal: !store.horizontal() });
      },

      setHover(cell: Coord | null): void {
        if (store.phase() === 'setup') patchState(store, { hover: cell });
      },

      randomize(): void {
        patchState(store, {
          player: randomFleet(store.allowTouch()),
          placeIdx: FLEET.length,
          hover: null,
          status: placePrompt(FLEET.length),
        });
      },

      placeAt(r: number, c: number): void {
        if (store.phase() !== 'setup' || store.placeIdx() >= FLEET.length) return;
        const spec = FLEET[store.placeIdx()];
        if (!canPlace(store.player(), r, c, spec.len, store.horizontal(), store.allowTouch())) {
          patchState(store, { status: [{ key: store.allowTouch() ? 'status_no_fit' : 'status_no_fit_touch', ship: spec.id }] });
          return;
        }
        const placeIdx = store.placeIdx() + 1;
        patchState(store, {
          player: placeShip(store.player(), spec, r, c, store.horizontal()),
          placeIdx,
          hover: null,
          status: placePrompt(placeIdx),
        });
      },

      startBattle(): void {
        if (store.placeIdx() < FLEET.length) return;
        cancelTimer();
        patchState(store, {
          enemy: randomFleet(store.allowTouch()),
          phase: 'battle',
          turn: 'player',
          hover: null,
          lastAiShot: null,
          lastPlayerShot: null,
          shots: { player: 0, ai: 0 },
          status: [{ key: 'status_your_turn' }],
        });
        // The game starts with the battle; placing ships alone is no game yet.
        logGame('start');
      },

      shootAt(r: number, c: number): void {
        const enemy = store.enemy();
        const k = store.enemyKnowledge();
        if (!enemy || !k || store.phase() !== 'battle' || store.turn() !== 'player') return;
        if (k[r][c] !== 'unknown') return;

        const outcome = fire(enemy, r, c);
        const shots = { ...store.shots(), player: store.shots().player + 1 };
        patchState(store, { enemy: outcome.board, lastPlayerShot: [r, c], shots });

        if (outcome.gameOver) {
          patchState(store, { phase: 'over', turn: null, status: [{ key: 'status_won', params: { shots: shots.player } }] });
          logGame('finish');
          return;
        }
        const msg = shotPart(outcome, [r, c], 'status_you');
        if (outcome.result !== 'miss' && store.extraShot()) {
          patchState(store, { status: [msg, { key: 'status_again' }] });
          return;
        }
        patchState(store, { turn: 'ai', status: [msg, { key: 'status_enemy_aims' }] });
        schedule(aiTurn);
      },

      _cancelTimer: cancelTimer,
    };
  }),

  withHooks(store => ({
    onDestroy: () => store._cancelTimer(),
  })),
);

/** The translated name of a ship. */
export function shipName(i18n: BattleshipI18n, id: ShipId): string {
  switch (id) {
    case 'carrier': return i18n.ship_carrier();
    case 'battleship': return i18n.ship_battleship();
    case 'cruiser': return i18n.ship_cruiser();
    case 'submarine': return i18n.ship_submarine();
    case 'destroyer': return i18n.ship_destroyer();
  }
}
