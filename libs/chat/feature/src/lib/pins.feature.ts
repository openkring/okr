import { computed, Signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, AlertController, ModalController } from '@ionic/angular';

import { GroupModel, MatrixMessage, MatrixRoom, UserModel } from '@okr/shared-models';
import { fill, hasRole, isKioskOnly } from '@okr/shared-util-core';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import type { MatrixChatService, MatrixPinsService, MatrixRoomPrefsService } from '@okr/chat-data-access';
import {
  ActivePin, activePins, aliasLocalpartOf, bookmarkSnippet, expiredSharedPins, findGroupOfRoom, getRoomDetailsSections,
  isEventPinned, isProtectedRoomAlias, MatrixChatI18n, PIN_ICON, PinPreview, PinScope, pinUntil, RoomKind, roomKindOf,
  unpinnableScopes,
} from '@okr/chat-util';
import { isAdminMember } from '@okr/subject-group-util';

import type { PinMessageChoice } from './pin-message.modal';
import type { PinnedMessageItem } from './pinned-messages.modal';

/**
 * Pins in the chat (spec 1.109 §6) — the store wiring lives in `matrix-chat.store.ts`, the logic
 * here: room kind and the «Für alle» right, the active pins of the open room, the banner
 * preview, and the pin / unpin / menu / list flows.
 */

/** How often the active pins are re-evaluated, so an expired pin disappears without a reload. */
export const PIN_CLOCK_MS = 60_000;

/** What the pin computeds read from the store. */
export interface PinComputedDeps {
  currentRoomId: Signal<string | undefined>;
  currentRoom: Signal<MatrixRoom | undefined>;
  isCurrentRoomNotes: Signal<boolean>;
  isMatrixInitialized: Signal<boolean>;
  roomStateVersionResource: { value: Signal<number | undefined> };
  appStore: {
    tenantId: Signal<string>;
    currentUser: Signal<UserModel | undefined>;
    allGroupsAndChats: Signal<GroupModel[]>;
  };
  roomPrefs: MatrixRoomPrefsService;
  pinsService: MatrixPinsService;
  /** Coarse clock (ms), ticking every {@link PIN_CLOCK_MS}. */
  pinClock: Signal<number>;
}

export function pinComputeds(s: PinComputedDeps) {
  /** The group, ad-hoc chat or pinboard the open room belongs to. */
  const currentRoomGroup = computed((): GroupModel | undefined => {
    const room = s.currentRoom();
    if (!room) return undefined;
    // A live group wins over an archived one that still carries the same room id or alias.
    const groups = s.appStore.allGroupsAndChats();
    return findGroupOfRoom(groups.filter((g) => !g.isArchived), room.roomId, room.topic)
      ?? findGroupOfRoom(groups, room.roomId, room.topic);
  });

  /** Kind of the open room (spec 1.109 §8); also the input of the Chat-Details page. */
  const currentRoomKind = computed((): RoomKind | undefined => {
    const room = s.currentRoom();
    if (!room) return undefined;
    const group = currentRoomGroup();
    return roomKindOf({
      isDirect: room.isDirect,
      isNotes: s.isCurrentRoomNotes(),
      isSupport: isProtectedRoomAlias(aliasLocalpartOf(room.topic), s.appStore.tenantId()),
      groupKind: group ? (group.kind ?? 'group') : undefined,
    });
  });

  /**
   * Whether the caller may pin (and unpin) for everyone in the open room. Ad-hoc chats and DMs:
   * every member; group rooms and pinboards: group admins, privileged, admin; notes and support:
   * never; any other room: only when the client may write the state directly. Kiosk: never.
   */
  const canPinForAll = computed((): boolean => {
    const roomId = s.currentRoomId();
    const kind = currentRoomKind();
    const user = s.appStore.currentUser();
    if (!roomId || !kind || !user || isKioskOnly(user)) return false;
    if (kind === 'other') {
      s.roomStateVersionResource.value(); // power levels may change
      return s.pinsService.canWriteSharedPins(roomId);
    }
    return getRoomDetailsSections({
      kind,
      isAdmin: hasRole('admin', user),
      isPrivileged: hasRole('privileged', user),
      isGroupAdmin: isAdminMember(currentRoomGroup(), user.personKey),
      isCreator: false,
      activePinCount: 0,
    }).pinForAll;
  });

  /** Active pins of the open room: shared first, then personal, each newest first. */
  const currentPins = computed((): ActivePin[] => {
    const roomId = s.currentRoomId();
    if (!roomId || !s.isMatrixInitialized()) return [];
    s.roomStateVersionResource.value(); // m.room.pinned_events / org.okr.pin_expiry changes
    // personalPins() reads roomPrefs.pinsVersion, so a new personal pin re-runs this too.
    return activePins(
      s.roomPrefs.personalPins(roomId),
      s.pinsService.sharedPinned(roomId),
      s.pinsService.sharedExpiry(roomId),
      s.pinClock(),
    );
  });

  return { currentRoomGroup, currentRoomKind, canPinForAll, currentPins };
}

/** Sender and snippet of a loaded message. */
export function previewOfMessage(message: MatrixMessage): PinPreview {
  return { senderName: message.senderName, snippet: bookmarkSnippet(message) };
}

/** What the pin methods use from the store. */
export interface PinMethodDeps {
  currentRoomId: Signal<string | undefined>;
  currentPins: Signal<ActivePin[]>;
  canPinForAll: Signal<boolean>;
  bannerPreview: Signal<PinPreview>;
  messagesResource: { value: Signal<MatrixMessage[] | null | undefined> };
  imgixBaseUrl: Signal<string>;
  i18n: MatrixChatI18n;
  appStore: { currentUser: Signal<UserModel | undefined> };
  matrixService: MatrixChatService;
  roomPrefs: MatrixRoomPrefsService;
  pinsService: MatrixPinsService;
  modalController: ModalController;
  alertController: AlertController;
  actionSheetController: ActionSheetController;
  alertService: AlertService;
  jumpToEvent(roomId: string, eventId: string): Promise<void>;
}

export function pinMethods(store: PinMethodDeps) {
  /** Rooms whose expired shared pins were already cleaned up in this session. */
  const cleanedRooms = new Set<string>();

  const isKiosk = (): boolean => isKioskOnly(store.appStore.currentUser());

  const loadedMessage = (eventId: string): MatrixMessage | undefined =>
    (store.messagesResource.value() ?? []).find((m) => m.eventId === eventId);

  const previewOf = async (roomId: string, eventId: string): Promise<PinPreview> => {
    const loaded = loadedMessage(eventId);
    if (loaded && !loaded.isRedacted) return previewOfMessage(loaded);
    return (await store.matrixService.getEventPreview(roomId, eventId)) ?? { senderName: '', snippet: store.i18n.pin_unknown() };
  };

  const removeScope = async (roomId: string, eventId: string, scope: PinScope): Promise<void> => {
    try {
      if (scope === 'shared') await store.pinsService.removeSharedPin(roomId, eventId);
      else await store.roomPrefs.removePersonalPin(roomId, eventId);
    } catch (error) {
      console.warn('MatrixChatStore.unpin: failed:', error);
      await store.alertService.showToast(store.i18n.room_pin_error());
    }
  };

  /** Pinned in both scopes: ask which one to remove. */
  const askScope = async (): Promise<PinScope | undefined> => {
    const alert = await store.alertController.create({
      header: store.i18n.pin_unpin_which(),
      buttons: [
        { text: store.i18n.pin_label_me(), role: 'personal' },
        { text: store.i18n.pin_label_all(), role: 'shared' },
        { text: store.i18n.cancel(), role: 'cancel' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'personal' || role === 'shared' ? role : undefined;
  };

  /** The list of all active pins; a tap jumps to the message. */
  const openPinnedList = async (): Promise<void> => {
    const roomId = store.currentRoomId();
    const pins = store.currentPins();
    if (!roomId || pins.length === 0) return;
    const items: PinnedMessageItem[] = await Promise.all(
      pins.map(async (pin) => ({ pin, ...(await previewOf(roomId, pin.eventId)) })),
    );
    const { PinnedMessagesModal } = await import('./pinned-messages.modal');
    const modal = await store.modalController.create({
      component: PinnedMessagesModal,
      componentProps: { items },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<string>();
    if (role === 'jump' && data) await store.jumpToEvent(roomId, data);
  };

  return {
    /** Whether a message of the open room is pinned (in either scope) — «Anheften» vs «Lösen». */
    isMessagePinned(eventId: string): boolean {
      return isEventPinned(eventId, store.currentPins());
    },

    /** «Anheften»: duration and scope from the pin dialog, then the personal or shared write. */
    async pin(message: MatrixMessage): Promise<void> {
      const roomId = store.currentRoomId();
      if (!roomId || isKiosk() || message.roomId !== roomId) return;
      const canPinForAll = store.canPinForAll();
      const { PinMessageModal } = await import('./pin-message.modal');
      const modal = await store.modalController.create({
        component: PinMessageModal,
        componentProps: { canPinForAll },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<PinMessageChoice>();
      if (role !== 'confirm' || !data) return;
      const until = pinUntil(data.duration, Date.now());
      try {
        if (data.forAll && canPinForAll) await store.pinsService.setSharedPin(roomId, message.eventId, until);
        else await store.roomPrefs.setPersonalPin(roomId, message.eventId, until);
      } catch (error) {
        console.warn('MatrixChatStore.pin: failed:', error);
        await store.alertService.showToast(store.i18n.room_pin_error());
      }
    },

    /** «Lösen»: personal always, shared only with the right; pinned in both → ask which. */
    async unpin(message: MatrixMessage): Promise<void> {
      const roomId = store.currentRoomId();
      if (!roomId || isKiosk() || message.roomId !== roomId) return;
      const scopes = unpinnableScopes(message.eventId, store.currentPins(), store.canPinForAll());
      if (scopes.length === 0) return;
      const scope = scopes.length === 1 ? scopes[0] : await askScope();
      if (scope) await removeScope(roomId, message.eventId, scope);
    },

    /** Banner text tap: jump to the banner's pin. */
    async jumpToPin(eventId?: string): Promise<void> {
      const roomId = store.currentRoomId();
      const target = eventId ?? store.currentPins()[0]?.eventId;
      if (roomId && target) await store.jumpToEvent(roomId, target);
    },

    /** Banner pin icon: «Zur Nachricht» · «Alle angehefteten (n)» · «Lösen». */
    async openPinMenu(): Promise<void> {
      const roomId = store.currentRoomId();
      const pins = store.currentPins();
      const pin = pins[0];
      if (!roomId || !pin) return;
      const base = store.imgixBaseUrl();
      const opts = createActionSheetOptions(store.bannerPreview().snippet);
      opts.buttons.push(createActionSheetButton('pin.goto', store.i18n.pin_goto(), base, 'arrow-forward'));
      if (pins.length > 1) {
        opts.buttons.push(createActionSheetButton('pin.list', fill(store.i18n.pin_list(), { n: pins.length }), base, 'list'));
      }
      const mayUnpin = !isKiosk() && (pin.scope === 'personal' || store.canPinForAll());
      if (mayUnpin) opts.buttons.push(createActionSheetButton('pin.unpin', store.i18n.unpin_action(), base, PIN_ICON));
      opts.buttons.push(createActionSheetButton('cancel', store.i18n.cancel(), base, 'cancel'));

      const sheet = await store.actionSheetController.create(opts as ActionSheetOptions);
      await sheet.present();
      const { data } = await sheet.onDidDismiss();
      switch (data?.action) {
        case 'pin.goto': await store.jumpToEvent(roomId, pin.eventId); break;
        case 'pin.list': await openPinnedList(); break;
        case 'pin.unpin': if (mayUnpin) await removeScope(roomId, pin.eventId, pin.scope); break;
      }
    },

    openPinnedList,

    /**
     * Unpin the expired shared pins of a room once per session (spec 1.109 §6 cleanup), so they
     * also leave `m.room.pinned_events` (and Element). Fire and forget: errors are only logged.
     */
    cleanupExpiredPins(roomId: string): void {
      // Not before the room (and its state) is in the client: an empty list then means nothing.
      if (cleanedRooms.has(roomId) || isKiosk() || !store.matrixService.getRoom(roomId)) return;
      const expired = expiredSharedPins(store.pinsService.sharedPinned(roomId), store.pinsService.sharedExpiry(roomId), Date.now());
      cleanedRooms.add(roomId);
      if (expired.length === 0) return;
      store.pinsService.cleanupExpiredSharedPins(roomId, Date.now()).catch((error) =>
        console.warn('MatrixChatStore.cleanupExpiredPins: failed (non-critical):', error));
    },
  };
}
