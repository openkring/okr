import { computed, Signal } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';

import { MatrixRoom, UserModel } from '@okr/shared-models';
import { isKioskOnly } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';
import type { MatrixRoomPrefsService } from '@okr/chat-data-access';
import { countUnmutedUnread, isAllMuted, MatrixChatI18n, mutedRoomIds, muteUntil } from '@okr/chat-util';

import { pickMuteDuration } from './mute-duration.util';

/**
 * Mute and hide in the room list (spec 1.109 §9, §10.1) — the store wiring lives in
 * `matrix-chat.store.ts`, the logic here.
 *
 * `rooms` stays the full tenant-filtered list: the notes / support finders, `currentRoom`, the
 * deep-link and permalink resolution, the forward targets and Chat-Wartung all need hidden rooms
 * too. Only the room list itself shows {@link visibleRooms}; the hidden ones sit in their own
 * «Ausgeblendet (n)» block.
 */

/** What the mute computeds read from the store. */
export interface RoomMuteComputedDeps {
  rooms: Signal<MatrixRoom[]>;
  appStore: { tenantId: Signal<string>; currentUser: Signal<UserModel | undefined> };
  roomPrefs: MatrixRoomPrefsService;
  /** Coarse clock (ms): a mute that runs out ends without a reload. */
  pinClock: Signal<number>;
}

export function roomMuteComputeds(s: RoomMuteComputedDeps) {
  /** The rooms of the room list: the tenant's rooms without the hidden ones (tenant filter first). */
  const visibleRooms = computed((): MatrixRoom[] => {
    s.roomPrefs.hiddenVersion();
    return s.rooms().filter((r) => !s.roomPrefs.isHidden(r.roomId));
  });

  /** The tenant's rooms the user hid («Ausgeblendet»). */
  const hiddenRooms = computed((): MatrixRoom[] => {
    s.roomPrefs.hiddenVersion();
    return s.rooms().filter((r) => s.roomPrefs.isHidden(r.roomId));
  });

  /** Rooms that show the 🔕 (own mute or «Alle stummschalten»; never support / Notfall). */
  const mutedRoomIdSet = computed((): Set<string> =>
    mutedRoomIds(s.rooms(), s.roomPrefs.muteContent(), s.appStore.tenantId(), s.pinClock()));

  /** Whether «Alle Chats stummschalten» is on in this tenant app. */
  const isAllRoomsMuted = computed((): boolean =>
    isAllMuted(s.roomPrefs.muteContent(), s.appStore.tenantId(), s.pinClock()));

  /** Kiosk devices get no bell (spec 1.109 §9). */
  const canMuteAll = computed((): boolean => !!s.appStore.currentUser() && !isKioskOnly(s.appStore.currentUser()));

  /** The in-app / PWA-badge chat total: hidden and muted rooms do not count. */
  const totalUnreadCount = computed((): number =>
    countUnmutedUnread(visibleRooms(), s.roomPrefs.muteContent(), s.appStore.tenantId(), s.pinClock()));

  return { visibleRooms, hiddenRooms, mutedRoomIds: mutedRoomIdSet, isAllRoomsMuted, canMuteAll, totalUnreadCount };
}

/** What the mute methods use from the store. */
export interface RoomMuteMethodDeps {
  appStore: { tenantId: Signal<string> };
  roomPrefs: MatrixRoomPrefsService;
  canMuteAll: Signal<boolean>;
  imgixBaseUrl: Signal<string>;
  i18n: MatrixChatI18n;
  actionSheetController: ActionSheetController;
  alertService: AlertService;
}

export function roomMuteMethods(store: RoomMuteMethodDeps) {
  return {
    /** The bell in the room-list header: «Alle Chats stummschalten» of this tenant app (spec 1.109 §9). */
    async pickAllMute(): Promise<void> {
      const tenantId = store.appStore.tenantId();
      if (!tenantId || !store.canMuteAll()) return;
      const muted = isAllMuted(store.roomPrefs.muteContent(), tenantId, Date.now());
      const i18n = store.i18n;
      const labels = {
        mute_tile: i18n.mute_all,
        mute_1h: i18n.mute_1h,
        mute_8h: i18n.mute_8h,
        mute_1w: i18n.mute_1w,
        mute_forever: i18n.mute_forever,
        mute_unmute: i18n.mute_unmute,
        cancel: i18n.cancel,
      };
      const choice = await pickMuteDuration(store.actionSheetController, labels, store.imgixBaseUrl(), muted);
      if (!choice) return;
      try {
        await store.roomPrefs.setAllMute(tenantId, choice === 'unmute' ? undefined : muteUntil(choice, Date.now()));
      } catch (error) {
        console.error('MatrixChatStore.pickAllMute: failed:', error);
        await store.alertService.showToast(store.i18n.details_error());
      }
    },

    /** «Wieder einblenden» (spec 1.109 §10.1): lifts the tag and the hide-mute, keeps a mute the user set. */
    async unhideRoom(roomId: string): Promise<void> {
      try {
        await store.roomPrefs.unhideRoom(roomId);
      } catch (error) {
        console.error('MatrixChatStore.unhideRoom: failed:', error);
        await store.alertService.showToast(store.i18n.details_error());
      }
    },
  };
}
