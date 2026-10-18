import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import {
  DEFAULT_JASS_CONFIG, JASS_I18N_KEYS, jassDiaryDate, jassDiaryLine, JassConfig, JassGame, JassHandFormModel, JassI18n, JassPlayer, JassVariant,
  JassChalkUnit, PLAYER_COUNTS, addChalk, addHand, createGame, deleteHand as deleteHandAt, handFromForm, newHandForm, nextTrumpMaker, normalizeConfig, parsePending,
  parseStoredGame, replaceHand, stats, totals, undoLast, jassConfigValidations, validateHand, winner,
} from '@okr/games-jasstafel-util';
import { ActivityService } from '@okr/activity-data-access';
import { DiaryLineService } from '@okr/content-diary-data-access';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

const GAME_KEY = 'jasstafel.game';
const CONFIG_KEY = 'jasstafel.config';
const ARCHIVE_KEY = 'jasstafel.archive';
const PENDING_KEY = 'jasstafel.pending';
const ARCHIVE_MAX = 20;
/** the keys before they were scoped to the user: shared by everyone who used the browser */
const LEGACY_KEYS = [GAME_KEY, CONFIG_KEY, ARCHIVE_KEY, PENDING_KEY];
const EMPTY_SEATS = (n = 4): (AvatarInfo | null)[] => Array.from({ length: n }, () => null);

type StorageFlag = { ok: boolean };
type HistoryResult = { action: 'edit' | 'delete' | 'clear'; index?: number };

/** `jasstafel.game` → `jasstafel.game.<uid>`: every signed-in user has their own slate on a shared device. */
const userKey = (key: string, uid: string) => `${key}.${uid}`;

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
  /** a diary transfer is in flight */
  diaryBusy: boolean;
};

/**
 * One Jasstafel per user on one device. Everything lives in `localStorage`, under keys scoped to
 * the signed-in user's uid (`jasstafel.game.<uid>`), so on a shared tablet nobody sees or
 * continues somebody else's game or history. The running game is written
 * after every change, so a reload resumes it; finished games go into a 20-entry archive. Storage
 * that throws (private mode, blocked site data) leaves the game running in memory and sets
 * `storageOk = false` for the page's note.
 *
 * Modals are imported dynamically (store ↔ modal cycle rule). Provided on the page, not rooted.
 */
export const JasstafelStore = signalStore(
  withState<JasstafelState>(() => ({
    variant: 'schieber',
    seats: EMPTY_SEATS(),
    bueterIdx: 0,
    config: DEFAULT_JASS_CONFIG,
    game: null,
    archive: [],
    pendingAnnounced: null,
    storageOk: true,
    diaryBusy: false,
  })),

  withProps(() => ({
    i18n: inject(I18nService).translateAll(JASS_I18N_KEYS) as JassI18n,
    modelSelectService: inject(ModelSelectService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    appStore: inject(AppStore),
    diaryLineService: inject(DiaryLineService),
    _storage: { ok: true } as StorageFlag,
    /** the user whose slate is loaded; '' = none yet, nothing is written */
    _uid: { value: '' },
    _activityService: inject(ActivityService),
    /** The game whose finish was last logged, so an undo and a re-decided result is not a second finish. */
    _finishLogged: { id: undefined as string | undefined },
  })),

  withComputed(store => ({
    totals: computed(() => { const g = store.game(); return g ? totals(g) : {}; }),
    outcome: computed(() => { const g = store.game(); return g ? winner(g) : undefined; }),
    stats: computed(() => { const g = store.game(); return g ? stats(g) : {}; }),
    /**
     * The result card's diary button (spec 1.77 §6.3): hidden unless the current user routes
     * `jasstafel` to at least one diary. The travel period is checked on the server only.
     */
    diaryState: computed((): 'hidden' | 'ready' | 'done' => {
      const g = store.game();
      const routed = (store.appStore.currentUser()?.diaryTargets ?? []).some(t => (t.sources ?? []).includes('jasstafel'));
      if (!g?.finishedAt || !routed) return 'hidden';
      return g.diaryAt ? 'done' : 'ready';
    }),
    canStart: computed(() => {
      const seats = store.seats();
      const filled = seats.filter(Boolean).length;
      const firstGap = seats.findIndex(s => !s);
      const contiguous = firstGap === -1 || seats.slice(firstGap).every(s => !s);
      return PLAYER_COUNTS[store.variant()].includes(filled) && contiguous && jassConfigValidations(store.config()).isValid();
    }),
  })),

  withMethods(store => {
    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('jasstafel', action, store.appStore.currentUser);
    }

    function persist(): void {
      const uid = store._uid.value;
      if (!uid) return;
      write(userKey(GAME_KEY, uid), store.game(), store._storage);
      write(userKey(CONFIG_KEY, uid), store.config(), store._storage);
      write(userKey(ARCHIVE_KEY, uid), store.archive(), store._storage);
      write(userKey(PENDING_KEY, uid), store.pendingAnnounced(), store._storage);
      patchState(store, { storageOk: store._storage.ok });
    }

    /**
     * The unscoped keys of the first version belonged to whoever used the browser last, so a game
     * or archive in them cannot be handed to this user. Only the settings carry over (they name
     * nobody); then the old keys go.
     */
    function dropLegacyKeys(uid: string): void {
      const legacyConfig = read<unknown>(CONFIG_KEY, store._storage);
      if (legacyConfig && read<unknown>(userKey(CONFIG_KEY, uid), store._storage) === null) {
        write(userKey(CONFIG_KEY, uid), legacyConfig, store._storage);
      }
      for (const key of LEGACY_KEYS) write(key, null, store._storage);
    }

    /** Sets or clears finishedAt from the recomputed outcome and keeps the archive in step. */
    function setGame(next: JassGame | null): void {
      let game = next;
      if (game) {
        const done = winner(game) !== undefined;
        if (done && !game.finishedAt) {
          game = { ...game, finishedAt: getTodayStr(DateFormat.StoreDateTime) };
          if (store._finishLogged.id !== game.id) {
            store._finishLogged.id = game.id;
            logGame('finish');
          }
        }
        // an undo re-opens the game: its diary mark goes with it, so the corrected result can be sent again
        if (!done && game.finishedAt) game = { ...game, finishedAt: undefined, diaryAt: undefined };
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
      // the bid is set on the start screen; canStart already refuses an invalid one
      const bid = store.variant() === 'bueter' ? store.config().bueterBid : undefined;
      patchState(store, { pendingAnnounced: null });
      setGame(createGame(store.variant(), players, store.config(), { bid, bueterIdx: store.bueterIdx() }));
      logGame('start');
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
      setGame(deleteHandAt(game, index));
    }

    return {
      /** Loads the slate of `uid` (the signed-in user); a different user replaces everything shown. */
      load(uid: string): void {
        if (!uid || uid === store._uid.value) return;
        store._uid.value = uid;
        store._finishLogged.id = undefined;
        dropLegacyKeys(uid);
        const config = normalizeConfig(read(userKey(CONFIG_KEY, uid), store._storage));
        const game = parseStoredGame(read(userKey(GAME_KEY, uid), store._storage));
        const pendingAnnounced = parsePending(read(userKey(PENDING_KEY, uid), store._storage), game);
        const rawArchive = read<unknown[]>(userKey(ARCHIVE_KEY, uid), store._storage);
        const archive = (Array.isArray(rawArchive) ? rawArchive : []).map(parseStoredGame).filter((g): g is JassGame => !!g);
        const seats = game ? game.players.map(p => p.avatar) : EMPTY_SEATS();
        // a resumed game was logged when it was started; one restored already decided is not finished again
        if (game?.finishedAt) store._finishLogged.id = game.id;
        patchState(store, {
          config, game, archive, seats, pendingAnnounced, variant: game?.variant ?? 'schieber', bueterIdx: game?.bueterIdx ?? 0,
          storageOk: store._storage.ok, diaryBusy: false,
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

      /**
       * Differenzler: step 1 before the hand, step 2 after it; every other variant: one step.
       * `sideId` (the «+» of a slate half): the form asks only that side's points.
       */
      async enterHand(sideId = ''): Promise<void> {
        const game = store.game();
        if (!game || store.outcome() !== undefined) return;
        const pending = store.pendingAnnounced();
        const phase: JassHandFormModel['phase'] = game.variant !== 'differenzler' ? 'full' : (pending ? 'points' : 'announce');
        const model = newHandForm(game, phase, undefined, undefined, sideId);
        if (phase === 'points' && pending) model.announced = [...pending];
        const maker = nextTrumpMaker(game);
        const result = await openHandModal(game, model, maker);
        if (!result) return;
        if (phase === 'announce') {
          patchState(store, { pendingAnnounced: result.announced });
          persist();
          return;
        }
        const hand = handFromForm(result, maker);
        if (validateHand(game, hand).length) return;
        patchState(store, { pendingAnnounced: null });
        setGame(addHand(game, hand));
      },

      editHand,
      deleteHand,

      /** A tap on a line of a side's Z: Weis (Stöck included) of 100, 50 or 20, never multiplied. */
      addChalk(sideId: string, unit: JassChalkUnit): void {
        const game = store.game();
        if (!game || store.outcome() !== undefined) return;
        setGame(addChalk(game, sideId, unit));
      },

      undo(): void {
        if (store.pendingAnnounced()) {
          patchState(store, { pendingAnnounced: null });
          persist();
          return;
        }
        const game = store.game();
        if (game) setGame(undoLast(game));
      },

      /** Start-screen settings are saved as they are typed; a running game keeps its own copy. */
      setConfig(config: JassConfig): void {
        patchState(store, { config: normalizeConfig(config) });
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

      /**
       * One line with the result and statistics into the caller's diary entry of the day the game
       * finished, into the diaries the user's own `diaryTargets` route `jasstafel` to (spec 1.77;
       * `recordDiaryLine` callable). A game outside every diary's travel period is not sent.
       * The game is marked so the button cannot send it twice.
       */
      async toDiary(): Promise<void> {
        const game = store.game();
        if (!game || store.diaryState() !== 'ready' || store.diaryBusy()) return;
        const i = store.i18n;
        const variant = { schieber: i.variant_schieber, bueter: i.variant_bueter, coiffeur: i.variant_coiffeur, differenzler: i.variant_differenzler }[game.variant]();
        const line = jassDiaryLine(game, {
          prefix: i.diary_prefix(), variant, winner: i.winner(), draw: i.draw(),
          weis: i.stat_weis(), matches: i.stat_matches(), hands: i.diary_hands(),
        });
        patchState(store, { diaryBusy: true });
        try {
          const { status, written } = await store.diaryLineService.record({ tenantId: store.appStore.tenantId(), source: 'jasstafel', date: jassDiaryDate(game), line });
          if (status === 'skipped-final') {
            await store.alertService.showToast(i.diary_final());
            return;
          }
          if (status === 'skipped-no-target') {
            await store.alertService.showToast(i.diary_outside());
            return;
          }
          setGame({ ...game, diaryAt: getTodayStr(DateFormat.StoreDateTime) });
          await store.alertService.showToast(fill(i.diary_ok_in(), { diaries: written.join(', ') }));
        } catch (error) {
          const code = (error as { code?: string }).code ?? '';
          const denied = code.endsWith('permission-denied') || code.endsWith('failed-precondition');
          if (!denied) console.error('JasstafelStore.toDiary', error);
          await store.alertService.showToast(denied ? i.diary_denied() : i.diary_error());
        } finally {
          patchState(store, { diaryBusy: false });
        }
      },

      async endGame(): Promise<void> {
        if (store.game() && store.outcome() === undefined) {
          if (!(await store.alertService.confirm(store.i18n.end_confirm(), true))) return;
        }
        // the start screen begins empty: the seats are picked again for the next round of players
        const n = Math.max(...PLAYER_COUNTS[store.variant()]);
        patchState(store, { pendingAnnounced: null, seats: EMPTY_SEATS(n), bueterIdx: 0 });
        setGame(null);
      },

      /**
       * Same players and variant. Büter goes back to the start screen with the seats kept, because
       * a new game means new bidding and possibly a different Büter; every other variant restarts.
       */
      async newGame(): Promise<void> {
        const game = store.game();
        if (game) patchState(store, { variant: game.variant, seats: game.players.map(p => p.avatar), bueterIdx: game.bueterIdx ?? 0 });
        setGame(null);
        if (game?.variant !== 'bueter') await start();
      },
    };
  }),
);
