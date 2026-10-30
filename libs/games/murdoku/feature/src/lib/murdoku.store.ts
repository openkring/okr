import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import {
  BLOCKING,
  Clue,
  Furniture,
  MURDOKU_GAME_KEY,
  MURDOKU_I18N_KEYS,
  MURDOKU_STATS_KEY,
  MurdokuDifficulty,
  MurdokuGame,
  MurdokuI18n,
  MurdokuPhase,
  MurdokuPuzzle,
  MurdokuStats,
  Placement,
  colLabel,
  conflictPeople,
  coordLabel,
  formatDuration,
  generatePuzzle,
  hintPerson,
  isComplete,
  isSolved,
  parseGame,
  parseStats,
  randomSeed,
  recordGivenUp,
  recordSolved,
  rowOf,
  serializeGame,
  serializeStats,
} from '@okr/games-murdoku-util';

/**
 * One sentence of the status line, kept as key + params rather than as text so that a language
 * switch mid-game re-renders it.
 */
export type StatusPart = {
  key: keyof typeof MURDOKU_I18N_KEYS;
  params?: Record<string, string | number>;
};

export type MurdokuState = {
  difficulty: MurdokuDifficulty;
  puzzle: MurdokuPuzzle;
  placement: Placement;
  /** People placed by a hint; they stay where they are. */
  locked: number[];
  /** Squares the player crossed out. */
  marks: number[];
  hints: number;
  phase: MurdokuPhase;
  startedAt: number;
  /** Set once the case leaves `play`; the clock stops there. */
  finishedAt: number | null;
  /** The person the next tapped square is for. */
  selected: number | null;
  /** When on, a tapped square is crossed out instead of taking a person. */
  markMode: boolean;
  /** «Aufgeben» was tapped once; the second tap reveals the solution. */
  confirmGiveUp: boolean;
  status: StatusPart | null;
  stats: MurdokuStats;
};

const DEFAULT_DIFFICULTY: MurdokuDifficulty = 'medium';

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

type GameFields = Pick<MurdokuState,
  'difficulty' | 'puzzle' | 'placement' | 'locked' | 'marks' | 'hints' | 'phase' | 'startedAt' | 'finishedAt' | 'selected'>;

function freshGame(difficulty: MurdokuDifficulty): GameFields {
  const puzzle = generatePuzzle(difficulty, randomSeed());
  return {
    difficulty,
    puzzle,
    placement: new Array<number | null>(puzzle.n).fill(null),
    locked: [],
    marks: [],
    hints: 0,
    phase: 'play',
    startedAt: Date.now(),
    finishedAt: null,
    selected: puzzle.victim,
  };
}

/** The saved case if it is still open, else null. */
function savedOpenGame(browser: boolean): MurdokuGame | null {
  const saved = browser ? parseGame(read(MURDOKU_GAME_KEY)) : null;
  return saved && (saved.phase === 'play' || saved.phase === 'accuse') ? saved : null;
}

/** The saved case if there is an open one, otherwise a fresh deal. */
function initialGame(browser: boolean): GameFields {
  const saved = savedOpenGame(browser);
  if (!saved) {
    const last = browser ? parseGame(read(MURDOKU_GAME_KEY)) : null;
    return freshGame(last?.difficulty ?? DEFAULT_DIFFICULTY);
  }
  const now = Date.now();
  return {
    difficulty: saved.difficulty,
    puzzle: generatePuzzle(saved.difficulty, saved.seed),
    placement: saved.placement,
    locked: saved.locked,
    marks: saved.marks,
    hints: saved.hints,
    phase: saved.phase,
    startedAt: now - saved.elapsedMs,
    finishedAt: saved.phase === 'play' ? null : now,
    selected: null,
  };
}

/**
 * Murdoku, played locally. The pure rules and the case generator live in
 * `@okr/games-murdoku-util`; this store keeps the running case — who stands where, crossed-out
 * squares, hints — and mirrors it into `localStorage` after every move so a reload resumes it.
 * Solved counts, best times and the streak are kept under a second key.
 *
 * Provide it on the component; it is deliberately not rooted.
 */
export const MurdokuStore = signalStore(
  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
    i18n: inject(I18nService).translateAll(MURDOKU_I18N_KEYS) as MurdokuI18n,
  })),

  withState<MurdokuState>(() => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    return {
      ...initialGame(browser),
      markMode: false,
      confirmGiveUp: false,
      status: null,
      stats: parseStats(browser ? read(MURDOKU_STATS_KEY) : null),
    };
  }),

  withComputed(store => ({
    playing: computed((): boolean => store.phase() === 'play'),
    /** Victim first, then the suspects by name — the order of the tray and the dossier. */
    order: computed((): number[] => {
      const p = store.puzzle();
      const rest = p.names.map((_, i) => i).filter(i => i !== p.victim).sort((a, b) => p.names[a].localeCompare(p.names[b]));
      return [p.victim, ...rest];
    }),
    conflicts: computed((): Set<number> => conflictPeople(store.puzzle(), store.placement())),
    placedCount: computed((): number => store.placement().filter(c => c !== null).length),
    /** Per row and per column, how many people stand in it: 1 = taken, 2+ = clash. */
    lines: computed((): { rows: number[]; cols: number[] } => {
      const n = store.puzzle().n, rows = new Array<number>(n).fill(0), cols = new Array<number>(n).fill(0);
      for (const c of store.placement()) {
        if (c === null) continue;
        rows[rowOf(c, n)]++;
        cols[c % n]++;
      }
      return { rows, cols };
    }),
    roomName: computed(() => (room: number): string => store.i18n[`room_${store.puzzle().roomIds[room]}`]()),
  })),

  withComputed(store => ({
    statusText: computed((): string => {
      const i18n = store.i18n;
      const part = store.status();
      if (part) return fill(i18n[part.key](), part.params ?? {});
      const p = store.puzzle();
      const time = formatDuration((store.finishedAt() ?? Date.now()) - store.startedAt());
      switch (store.phase()) {
        case 'accuse': return i18n.status_accuse();
        case 'revealed': return i18n.status_revealed();
        case 'closed': return store.hints()
          ? fill(i18n.status_solved_hints(), { time, count: store.hints() })
          : fill(i18n.status_solved(), { time });
      }
      if (store.markMode()) return i18n.status_marking();
      const counts = { placed: store.placedCount(), total: p.n };
      if (isComplete(store.placement())) return i18n.status_broken();
      const sel = store.selected();
      return sel === null
        ? fill(i18n.status_pick(), counts)
        : fill(i18n.status_placing(), { ...counts, name: p.names[sel] });
    }),

    statsText: computed((): string => {
      const s = store.stats(), level = s[store.difficulty()];
      return level.bestMs === null
        ? fill(store.i18n.stats(), { solved: level.solved, streak: s.streak })
        : fill(store.i18n.stats_best(), { solved: level.solved, best: formatDuration(level.bestMs), streak: s.streak });
    }),

    /** The text of one statement, in the current language. */
    clueText: computed(() => (c: Clue): string => {
      const i18n = store.i18n, p = store.puzzle();
      switch (c.t) {
        case 'room': return fill(i18n.clue_room(), { room: store.roomName()(c.a as number) });
        case 'notRoom': return fill(i18n.clue_notRoom(), { room: store.roomName()(c.a as number) });
        case 'on': return i18n[`on_${c.a as 'chair' | 'rug' | 'bed'}`]();
        case 'beside': return i18n[`beside_${c.a as Furniture}`]();
        case 'bare': return i18n.clue_bare();
        case 'edge': return i18n.clue_edge();
        case 'inner': return i18n.clue_inner();
        case 'row': return fill(i18n.clue_row(), { row: (c.a as number) + 1 });
        case 'col': return fill(i18n.clue_col(), { col: colLabel(c.a as number) });
        case 'alone': return i18n.clue_alone();
        case 'company': return i18n.clue_company();
        case 'north': return fill(i18n.clue_north(), { name: p.names[c.a as number] });
        case 'west': return fill(i18n.clue_west(), { name: p.names[c.a as number] });
      }
    }),
  })),

  withMethods(store => {
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    function persist(): void {
      if (!store._browser) return;
      const game: MurdokuGame = {
        difficulty: store.difficulty(),
        seed: store.puzzle().seed,
        placement: store.placement(),
        locked: store.locked(),
        marks: store.marks(),
        hints: store.hints(),
        elapsedMs: (store.finishedAt() ?? Date.now()) - store.startedAt(),
        phase: store.phase(),
      };
      write(MURDOKU_GAME_KEY, serializeGame(game));
    }

    function saveStats(stats: MurdokuStats): void {
      patchState(store, { stats });
      if (store._browser) write(MURDOKU_STATS_KEY, serializeStats(stats));
    }

    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('murdoku', action, store._appStore.currentUser);
    }

    /** The next person after `from` (in tray order) who is not yet placed. */
    function nextUnplaced(from: number, placement: Placement): number | null {
      const order = store.order();
      const i = Math.max(0, order.indexOf(from));
      for (let k = 1; k <= order.length; k++) {
        const p = order[(i + k) % order.length];
        if (placement[p] === null) return p;
      }
      return null;
    }

    /** Applies a new placement; if it is the solution, the case moves on to the accusation. */
    function commit(placement: Placement, selected: number | null, patch: Partial<MurdokuState> = {}): void {
      patchState(store, { placement, selected, status: null, confirmGiveUp: false, ...patch });
      if (isSolved(store.puzzle(), placement)) {
        patchState(store, { phase: 'accuse', finishedAt: Date.now(), selected: null, markMode: false });
      }
      persist();
    }

    function say(key: StatusPart['key'], params?: StatusPart['params']): void {
      patchState(store, { status: { key, params } });
    }

    /** Crosses a free square out, or back in. */
    function toggleMark(cell: number): void {
      if (!store.playing()) return;
      const f = store.puzzle().furniture[cell];
      if ((f && BLOCKING.includes(f)) || store.placement().includes(cell)) return;
      const marks = store.marks();
      patchState(store, { marks: marks.includes(cell) ? marks.filter(m => m !== cell) : [...marks, cell], status: null });
      persist();
    }

    return {
      newGame(difficulty: MurdokuDifficulty = store.difficulty()): void {
        clearTimeout(giveUpTimer);
        patchState(store, { ...freshGame(difficulty), markMode: false, confirmGiveUp: false, status: null });
        persist();
        logGame('start');
      },

      select(p: number): void {
        if (!store.playing()) return;
        patchState(store, { selected: store.selected() === p ? null : p, markMode: false, status: null });
      },

      toggleMarkMode(): void {
        if (!store.playing()) return;
        patchState(store, { markMode: !store.markMode(), status: null });
      },

      /** A tap on a square: place, pick up or cross out, depending on the mode and the square. */
      tapCell(cell: number): void {
        if (!store.playing()) return;
        const p = store.puzzle();
        const f = p.furniture[cell];
        if (f && BLOCKING.includes(f)) return say(`blocked_${f as 'table' | 'plant' | 'shelf'}`);
        const occupant = store.placement().indexOf(cell);
        if (store.markMode()) {
          if (occupant < 0) toggleMark(cell);
          return;
        }
        if (occupant >= 0) {
          if (store.locked().includes(occupant)) return say('status_locked', { name: p.names[occupant] });
          const placement = [...store.placement()];
          placement[occupant] = null;
          return commit(placement, occupant);
        }
        const sel = store.selected();
        if (sel === null) return say('status_pick_first');
        const placement = [...store.placement()];
        placement[sel] = cell;
        commit(placement, nextUnplaced(sel, placement), { marks: store.marks().filter(m => m !== cell) });
      },

      /** Right-click crosses a square out in any mode. */
      toggleMark,

      hint(): void {
        if (!store.playing()) return;
        const p = store.puzzle();
        const who = hintPerson(p, store.placement());
        if (who === null) return;
        const cell = p.solution[who];
        const placement = [...store.placement()];
        const other = placement.indexOf(cell);
        if (other >= 0 && other !== who) placement[other] = null;
        placement[who] = cell;
        const sel = store.selected();
        commit(placement, sel === null || sel === who || placement[sel] !== null ? nextUnplaced(who, placement) : sel, {
          locked: [...store.locked(), who],
          marks: store.marks().filter(m => m !== cell),
          hints: store.hints() + 1,
        });
        if (store.playing()) say('status_hint', { name: p.names[who], at: coordLabel(cell, p.n) });
      },

      /** Takes everyone off the board except the people a hint placed. */
      clear(): void {
        if (!store.playing()) return;
        const locked = new Set(store.locked());
        const placement = store.placement().map((c, p) => (locked.has(p) ? c : null));
        commit(placement, nextUnplaced(store.order()[store.order().length - 1], placement), { marks: [] });
      },

      /** First tap arms, second tap reveals; the arming lapses after a few seconds. */
      giveUp(): void {
        if (!store.playing()) return;
        clearTimeout(giveUpTimer);
        if (!store.confirmGiveUp()) {
          patchState(store, { confirmGiveUp: true });
          giveUpTimer = setTimeout(() => patchState(store, { confirmGiveUp: false }), 4000);
          return;
        }
        patchState(store, {
          placement: [...store.puzzle().solution],
          phase: 'revealed', finishedAt: Date.now(), selected: null,
          markMode: false, confirmGiveUp: false, status: null,
        });
        saveStats(recordGivenUp(store.stats()));
        persist();
      },

      accuse(p: number): void {
        if (store.phase() !== 'accuse') return;
        const puzzle = store.puzzle();
        if (p !== puzzle.killer) return say('status_alibi', { name: puzzle.names[p], victim: puzzle.names[puzzle.victim] });
        patchState(store, { phase: 'closed', status: null });
        saveStats(recordSolved(store.stats(), store.difficulty(), (store.finishedAt() ?? Date.now()) - store.startedAt(), store.hints()));
        persist();
        logGame('finish');
      },
    };
  }),

  withHooks({
    // Opening the page without an open case deals a fresh one: that is a start too. A resumed
    // case was already logged when it was dealt.
    onInit(store) {
      if (store._browser && !savedOpenGame(store._browser)) {
        store._activityService.logGame('murdoku', 'start', store._appStore.currentUser);
      }
      if (store._browser) {
        // persist the fresh deal right away, so a reload resumes the same case
        write(MURDOKU_GAME_KEY, serializeGame({
          difficulty: store.difficulty(), seed: store.puzzle().seed, placement: store.placement(),
          locked: store.locked(), marks: store.marks(), hints: store.hints(),
          elapsedMs: (store.finishedAt() ?? Date.now()) - store.startedAt(), phase: store.phase(),
        }));
      }
    },
  }),
);
