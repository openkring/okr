import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import {
  DEFAULT_JASS_CONFIG, JASS_I18N_KEYS, JassConfig, JassGame, JassHandFormModel, JassI18n, JassPlayer, JassVariant,
  PLAYER_COUNTS, addHand, createGame, handFromForm, newHandForm, nextTrumpMaker, normalizeConfig, replaceHand,
  stats, totals, undoHand, validateBid, validateHand, winner,
} from '@okr/games-jasstafel-util';
import { ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';

const GAME_KEY = 'jasstafel.game';
const CONFIG_KEY = 'jasstafel.config';
const ARCHIVE_KEY = 'jasstafel.archive';
const ARCHIVE_MAX = 20;

type StorageFlag = { ok: boolean };
type HistoryResult = { action: 'edit' | 'delete' | 'clear'; index?: number };

function read<T>(key: string, flag: StorageFlag): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    flag.ok = false;
    return null;
  }
}

function write(key: string, value: unknown, flag: StorageFlag): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    flag.ok = false;
  }
}

/** A stored game is trusted only if it has the fields the engine reads. */
function readGame(raw: unknown): JassGame | null {
  const g = raw as JassGame | null;
  if (!g || typeof g !== 'object' || !Array.isArray(g.hands) || !Array.isArray(g.sides) || !Array.isArray(g.players)) return null;
  return { ...g, config: normalizeConfig(g.config) };
}

const sameAvatar = (a: AvatarInfo, b: AvatarInfo) => (a.key || b.key)
  ? a.key === b.key
  : `${a.name1} ${a.name2}`.trim() === `${b.name1} ${b.name2}`.trim();

export type JasstafelState = {
  variant: JassVariant;
  seats: (AvatarInfo | null)[];
  bueterIdx: number;
  config: JassConfig;
  game: JassGame | null;
  archive: JassGame[];
  /** Differenzler: announcements of the hand being played, entered before the cards */
  pendingAnnounced: number[] | null;
  storageOk: boolean;
};

/**
 * One Jasstafel on one device. Everything lives in `localStorage`: the running game is written
 * after every change, so a reload resumes it; finished games go into a 20-entry archive. Storage
 * that throws (private mode, blocked site data) leaves the game running in memory and sets
 * `storageOk = false` for the page's note.
 *
 * Modals are imported dynamically (store ↔ modal cycle rule). Provided on the page, not rooted.
 */
export const JasstafelStore = signalStore(
  withState<JasstafelState>(() => ({
    variant: 'schieber',
    seats: [null, null, null, null],
    bueterIdx: 0,
    config: DEFAULT_JASS_CONFIG,
    game: null,
    archive: [],
    pendingAnnounced: null,
    storageOk: true,
  })),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(JASS_I18N_KEYS) as JassI18n,
    modelSelectService: inject(ModelSelectService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    _storage: { ok: true } as StorageFlag,
  })),

  withComputed(store => ({
    totals: computed(() => { const g = store.game(); return g ? totals(g) : {}; }),
    outcome: computed(() => { const g = store.game(); return g ? winner(g) : undefined; }),
    stats: computed(() => { const g = store.game(); return g ? stats(g) : {}; }),
    canStart: computed(() => {
      const seats = store.seats();
      const filled = seats.filter(Boolean).length;
      const firstGap = seats.findIndex(s => !s);
      const contiguous = firstGap === -1 || seats.slice(firstGap).every(s => !s);
      return PLAYER_COUNTS[store.variant()].includes(filled) && contiguous;
    }),
  })),

  withMethods(store => {
    function persist(): void {
      write(GAME_KEY, store.game(), store._storage);
      write(CONFIG_KEY, store.config(), store._storage);
      write(ARCHIVE_KEY, store.archive(), store._storage);
      patchState(store, { storageOk: store._storage.ok });
    }

    /** Sets or clears finishedAt from the recomputed outcome and keeps the archive in step. */
    function setGame(next: JassGame | null): void {
      let game = next;
      if (game) {
        const done = winner(game) !== undefined;
        if (done && !game.finishedAt) game = { ...game, finishedAt: new Date().toISOString() };
        if (!done && game.finishedAt) game = { ...game, finishedAt: undefined };
        const id = game.id;
        const others = store.archive().filter(a => a.id !== id);
        patchState(store, { archive: done ? [game, ...others].slice(0, ARCHIVE_MAX) : others });
      }
      patchState(store, { game });
      persist();
    }

    async function openHandModal(game: JassGame, model: JassHandFormModel, trumpMakerIdx: number, editIndex?: number): Promise<JassHandFormModel | undefined> {
      const { JassHandModal } = await import('@okr/games-jasstafel-ui');
      const modal = await store.modalController.create({
        component: JassHandModal,
        componentProps: { game, model, trumpMakerIdx, i18n: store.i18n, editIndex },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<JassHandFormModel>();
      return role === 'confirm' ? data : undefined;
    }

    async function start(): Promise<void> {
      if (!store.canStart()) return;
      const players: JassPlayer[] = store.seats().filter((s): s is AvatarInfo => !!s).map(avatar => ({ avatar }));
      let bid: number | undefined;
      if (store.variant() === 'bueter') {
        const raw = await store.alertService.okrPrompt(store.i18n.bid_title(), store.i18n.bid_placeholder());
        if (raw === undefined) return;
        bid = Number(raw.trim());
        if (!validateBid(bid, store.config())) {
          await store.alertService.showToast(store.i18n.bid_invalid());
          return;
        }
      }
      patchState(store, { pendingAnnounced: null });
      setGame(createGame(store.variant(), players, store.config(), { bid, bueterIdx: store.bueterIdx() }));
    }

    async function editHand(index: number): Promise<void> {
      const game = store.game();
      if (!game) return;
      const base = game.hands[index];
      const result = await openHandModal(game, newHandForm(game, 'full', base, index), base.trumpMakerIdx, index);
      if (!result) return;
      const hand = handFromForm(result, base.trumpMakerIdx);
      if (validateHand(game, hand, index).length) return;
      setGame(replaceHand(game, index, hand));
    }

    function deleteHand(index: number): void {
      const game = store.game();
      if (!game) return;
      setGame({ ...game, hands: game.hands.filter((_, i) => i !== index) });
    }

    return {
      load(): void {
        const config = normalizeConfig(read(CONFIG_KEY, store._storage));
        const game = readGame(read(GAME_KEY, store._storage));
        const rawArchive = read<unknown[]>(ARCHIVE_KEY, store._storage);
        const archive = (Array.isArray(rawArchive) ? rawArchive : []).map(readGame).filter((g): g is JassGame => !!g);
        const seats = game ? game.players.map(p => p.avatar) : [null, null, null, null];
        patchState(store, {
          config, game, archive, seats, variant: game?.variant ?? 'schieber', bueterIdx: game?.bueterIdx ?? 0,
          storageOk: store._storage.ok,
        });
      },

      setVariant(variant: JassVariant): void {
        const n = Math.max(...PLAYER_COUNTS[variant]);
        const seats = Array.from({ length: n }, (_, i) => store.seats()[i] ?? null);
        patchState(store, { variant, seats, bueterIdx: 0 });
      },

      setBueterIdx(bueterIdx: number): void {
        patchState(store, { bueterIdx });
      },

      async pickSeat(idx: number): Promise<void> {
        const avatar = await store.modelSelectService.selectPersonAvatar(undefined, undefined, true, true);
        if (!avatar) return;
        if (store.seats().some((s, i) => i !== idx && !!s && sameAvatar(s, avatar))) {
          await store.alertService.showToast(store.i18n.duplicate_player());
          return;
        }
        patchState(store, { seats: store.seats().map((s, i) => (i === idx ? avatar : s)) });
      },

      clearSeat(idx: number): void {
        patchState(store, { seats: store.seats().map((s, i) => (i === idx ? null : s)) });
      },

      start,

      /** Differenzler: step 1 before the hand, step 2 after it; every other variant: one step. */
      async enterHand(): Promise<void> {
        const game = store.game();
        if (!game || store.outcome() !== undefined) return;
        const pending = store.pendingAnnounced();
        const phase: JassHandFormModel['phase'] = game.variant !== 'differenzler' ? 'full' : (pending ? 'points' : 'announce');
        const model = newHandForm(game, phase);
        if (phase === 'points' && pending) model.announced = [...pending];
        const maker = nextTrumpMaker(game);
        const result = await openHandModal(game, model, maker);
        if (!result) return;
        if (phase === 'announce') {
          patchState(store, { pendingAnnounced: result.announced });
          return;
        }
        const hand = handFromForm(result, maker);
        if (validateHand(game, hand).length) return;
        patchState(store, { pendingAnnounced: null });
        setGame(addHand(game, hand));
      },

      editHand,
      deleteHand,

      undo(): void {
        if (store.pendingAnnounced()) {
          patchState(store, { pendingAnnounced: null });
          return;
        }
        const game = store.game();
        if (game?.hands.length) setGame(undoHand(game));
      },

      async openSettings(): Promise<void> {
        const { JassSettingsModal } = await import('@okr/games-jasstafel-ui');
        const modal = await store.modalController.create({
          component: JassSettingsModal,
          componentProps: { config: store.config(), i18n: store.i18n },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<JassConfig>();
        if (role !== 'confirm' || !data) return;
        patchState(store, { config: normalizeConfig(data) });
        persist();
      },

      async openHistory(): Promise<void> {
        const { JassHistoryModal } = await import('@okr/games-jasstafel-ui');
        const modal = await store.modalController.create({
          component: JassHistoryModal,
          componentProps: { game: store.game(), archive: store.archive(), i18n: store.i18n },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<HistoryResult>();
        if (role !== 'confirm' || !data) return;
        if (data.action === 'edit' && data.index !== undefined) await editHand(data.index);
        if (data.action === 'delete' && data.index !== undefined) deleteHand(data.index);
        if (data.action === 'clear') {
          patchState(store, { archive: [] });
          persist();
        }
      },

      async endGame(): Promise<void> {
        if (store.game() && store.outcome() === undefined) {
          if (!(await store.alertService.confirm(store.i18n.end_confirm(), true))) return;
        }
        patchState(store, { pendingAnnounced: null });
        setGame(null);
      },

      /** Same players and variant; the Büter is asked for a new bid. */
      async newGame(): Promise<void> {
        const game = store.game();
        if (game) patchState(store, { variant: game.variant, seats: game.players.map(p => p.avatar), bueterIdx: game.bueterIdx ?? 0 });
        setGame(null);
        await start();
      },
    };
  }),
);
