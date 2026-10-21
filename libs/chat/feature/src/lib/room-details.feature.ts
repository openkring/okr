import { computed, Signal } from '@angular/core';
import { ActionSheetController, ModalController } from '@ionic/angular';

import { GroupModel, MatrixRoom, PersonModel, UserModel } from '@okr/shared-models';
import { fill, hasRole } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';
import type { MatrixChatService, MatrixRoomPrefsService } from '@okr/chat-data-access';
import type { GroupService } from '@okr/subject-group-data-access';
import {
  ActivePin, aliasLocalpartOf, getRoomDetailsSections, isProtectedRoomAlias, isRoomMuted, MatrixChatI18n, muteUntil,
  RoomDetailsCtx, RoomDetailsSections, RoomKind,
} from '@okr/chat-util';
import { isAdminMember } from '@okr/subject-group-util';

import { pickMuteDuration } from './mute-duration.util';

/**
 * Chat-Details (spec 1.109 §8) — the store wiring lives in `matrix-chat.store.ts`, the logic here:
 * the context of the open room for `getRoomDetailsSections`, the mute state, and the hide /
 * archive / leave / remove-member flows. Visibility is decided by the util alone; the flows only
 * guard against a call the util did not offer.
 */

/** A row of the Chat-Details member list. */
export interface RoomDetailsMember {
  userId: string;
  /** Person okey (proper case) when the member is a known person, else ''. */
  personKey: string;
  name: string;
  isSelf: boolean;
}

/** What the details computeds read from the store. */
export interface RoomDetailsComputedDeps {
  currentRoom: Signal<MatrixRoom | undefined>;
  currentRoomKind: Signal<RoomKind | undefined>;
  currentRoomGroup: Signal<GroupModel | undefined>;
  currentPins: Signal<ActivePin[]>;
  appStore: { tenantId: Signal<string>; currentUser: Signal<UserModel | undefined>; allPersons: Signal<PersonModel[]> };
  roomPrefs: MatrixRoomPrefsService;
  matrixService: MatrixChatService;
  roomStateVersionResource: { value: Signal<number | undefined> };
  pinClock: Signal<number>;
  /** Bots and service accounts are no members to show (`isServiceAccount` of chat-data-access). */
  isServiceAccount: (userId: string) => boolean;
}

export function roomDetailsComputeds(s: RoomDetailsComputedDeps) {
  /** The input of `getRoomDetailsSections` for the open room. */
  const currentRoomDetailsCtx = computed((): RoomDetailsCtx | undefined => {
    const kind = s.currentRoomKind();
    const user = s.appStore.currentUser();
    if (!kind || !user) return undefined;
    const group = s.currentRoomGroup();
    const isGroupAdmin = isAdminMember(group, user.personKey);
    return {
      kind,
      isAdmin: hasRole('admin', user),
      isPrivileged: hasRole('privileged', user),
      isGroupAdmin,
      // An ad-hoc chat's creator is its admin (`group.admins`, handed on when the creator leaves).
      isCreator: kind === 'adhoc' && isGroupAdmin,
      activePinCount: s.currentPins().length,
    };
  });

  /** What the Chat-Details page offers for the open room. */
  const currentRoomDetails = computed((): RoomDetailsSections | undefined => {
    const ctx = currentRoomDetailsCtx();
    return ctx ? getRoomDetailsSections(ctx) : undefined;
  });

  /** Whether the open room is muted (its own mute or «Alle stummschalten»); support rooms never are. */
  const isCurrentRoomMuted = computed((): boolean => {
    const room = s.currentRoom();
    if (!room) return false;
    const tenantId = s.appStore.tenantId();
    return isRoomMuted(s.roomPrefs.muteContent(), room.roomId, tenantId, s.pinClock(),
      isProtectedRoomAlias(aliasLocalpartOf(room.topic), tenantId));
  });

  /** Joined members of the open room, from the Matrix room (self first, then by name). */
  const currentRoomMembers = computed((): RoomDetailsMember[] => {
    const room = s.currentRoom();
    if (!room) return [];
    s.roomStateVersionResource.value(); // joins, leaves, kicks
    const selfId = s.matrixService.getUserId();
    const persons = new Map(s.appStore.allPersons().map((p: PersonModel) => [p.okey.toLowerCase(), p]));
    return (s.matrixService.getRoom(room.roomId)?.getMembers() ?? [])
      .filter((m) => m.membership === 'join' && !s.isServiceAccount(m.userId))
      .map((m): RoomDetailsMember => {
        const person = persons.get(m.userId.slice(1).split(':')[0]);
        return {
          userId: m.userId,
          personKey: person?.okey ?? '',
          name: person ? `${person.firstName} ${person.lastName}`.trim() : (m.name || m.userId),
          isSelf: m.userId === selfId,
        };
      })
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));
  });

  return { currentRoomDetailsCtx, currentRoomDetails, isCurrentRoomMuted, currentRoomMembers };
}

/** What the details methods use from the store. */
export interface RoomDetailsMethodDeps {
  currentRoomId: Signal<string | undefined>;
  currentRoomKind: Signal<RoomKind | undefined>;
  currentRoomGroup: Signal<GroupModel | undefined>;
  currentRoomDetails: Signal<RoomDetailsSections | undefined>;
  isCurrentRoomMuted: Signal<boolean>;
  imgixBaseUrl: Signal<string>;
  i18n: MatrixChatI18n;
  appStore: { currentUser: Signal<UserModel | undefined> };
  matrixService: MatrixChatService;
  roomPrefs: MatrixRoomPrefsService;
  groupService: GroupService;
  modalController: ModalController;
  actionSheetController: ActionSheetController;
  alertService: AlertService;
  leaveAdhocChat(chat: GroupModel): Promise<boolean>;
  leavePinboard(pinboard: GroupModel): Promise<boolean>;
  archivePinboard(pinboard: GroupModel): Promise<boolean>;
  leaveRoom(): Promise<boolean>;
  exitRoomToList(roomId: string): void;
}

export function roomDetailsMethods(store: RoomDetailsMethodDeps) {
  /** The open room's id, only while it is still `roomId` (the user may have switched meanwhile). */
  const stillOpen = (roomId: string): boolean => store.currentRoomId() === roomId;

  /** Ad-hoc chat: archive the group doc; `onGroupChatCleanup` then empties the room's tenant marker. */
  const archiveAdhocChat = async (chat: GroupModel): Promise<boolean> => {
    try {
      const key = await store.groupService.update({ ...chat, isArchived: true }, store.appStore.currentUser());
      return !!key;
    } catch (error) {
      console.error('MatrixChatStore.archiveAdhocChat: failed:', error);
      return false;
    }
  };

  /** Any other (unmarked, admin-visible) room: empty tenant marker = in no app any more. */
  const archiveOtherRoom = async (roomId: string): Promise<boolean> => {
    try {
      await store.matrixService.assignMatrixRoomTenants(roomId, []);
      return true;
    } catch (error) {
      console.error('MatrixChatStore.archiveOtherRoom: failed:', error);
      await store.alertService.showToast(store.i18n.details_error());
      return false;
    }
  };

  return {
    /** Opens the Chat-Details page of the open room (tap on the room name). */
    async openRoomDetails(): Promise<void> {
      if (!store.currentRoomId() || !store.currentRoomDetails()) return;
      // Dynamic import: the modal injects this store back.
      const { ChatRoomDetailsModal } = await import('./chat-room-details.modal');
      const modal = await store.modalController.create({ component: ChatRoomDetailsModal, cssClass: 'full-modal' });
      await modal.present();
    },

    /** Stumm tile: duration sheet, then the mute write (spec 1.109 §9). */
    async pickRoomMute(roomId: string): Promise<void> {
      if (!store.currentRoomDetails()?.tiles.includes('mute')) return;
      const muted = stillOpen(roomId) && store.isCurrentRoomMuted();
      const choice = await pickMuteDuration(store.actionSheetController, store.i18n, store.imgixBaseUrl(), muted);
      if (!choice) return;
      try {
        if (choice === 'unmute') await store.roomPrefs.clearRoomMute(roomId);
        else await store.roomPrefs.setRoomMute(roomId, muteUntil(choice, Date.now()));
      } catch (error) {
        console.error('MatrixChatStore.pickRoomMute: failed:', error);
        await store.alertService.showToast(store.i18n.details_error());
      }
    },

    archiveAdhocChat,

    /** «Ausblenden» (spec 1.109 §10.1); true when the room left the list. */
    async hideCurrentRoom(): Promise<boolean> {
      const roomId = store.currentRoomId();
      if (!roomId || !store.currentRoomDetails()?.hide) return false;
      try {
        await store.roomPrefs.hideRoom(roomId);
      } catch (error) {
        console.error('MatrixChatStore.hideCurrentRoom: failed:', error);
        await store.alertService.showToast(store.i18n.details_error());
        return false;
      }
      store.exitRoomToList(roomId);
      return true;
    },

    /** «Chat archivieren» (spec 1.109 §10.2) per room kind; true when the room is gone. */
    async archiveCurrentRoom(): Promise<boolean> {
      const roomId = store.currentRoomId();
      const kind = store.currentRoomKind();
      const group = store.currentRoomGroup();
      if (!roomId || !store.currentRoomDetails()?.archive) return false;
      let done: boolean;
      if (kind === 'pinboard') {
        // archivePinboard asks with its own (pinboard) wording.
        if (!group) return false;
        done = await store.archivePinboard(group);
      } else {
        if (!await store.alertService.confirm(store.i18n.details_archive_confirm(), true)) return false;
        if (kind === 'adhoc') done = !!group && await archiveAdhocChat(group);
        else done = await archiveOtherRoom(roomId);
      }
      if (done) store.exitRoomToList(roomId);
      return done;
    },

    /** «Chat verlassen» (spec 1.109 §8.2) per room kind; true when the room was left. */
    async leaveCurrentRoom(): Promise<boolean> {
      const roomId = store.currentRoomId();
      const kind = store.currentRoomKind();
      const group = store.currentRoomGroup();
      if (!roomId || !store.currentRoomDetails()?.leave) return false;
      let done: boolean;
      if (kind === 'adhoc') {
        done = !!group && await store.leaveAdhocChat(group);
      } else if (kind === 'pinboard') {
        // leavePinboard asks with its own wording: a pinboard can be joined again from the list.
        done = !!group && await store.leavePinboard(group);
      } else {
        if (!await store.alertService.confirm(store.i18n.details_leave_confirm(), true)) return false;
        done = await store.leaveRoom();
        // A left DM is forgotten, so it never comes back; a new DM gets a new room (§12.12).
        if (done) {
          store.matrixService.forgetRoom(roomId).catch((error: unknown) =>
            console.warn('MatrixChatStore.leaveCurrentRoom: forget failed (non-critical):', error));
        }
      }
      if (done) store.exitRoomToList(roomId);
      return done;
    },

    /** ⊖ on a member of an ad-hoc chat (creator, admin); true when the member was removed. */
    async removeAdhocMember(personKey: string, name: string): Promise<boolean> {
      const group = store.currentRoomGroup();
      if (!group || store.currentRoomKind() !== 'adhoc' || !store.currentRoomDetails()?.canRemoveMembers) return false;
      if (personKey === store.appStore.currentUser()?.personKey) return false; // leaving is «Verlassen»
      if (!await store.alertService.confirm(fill(store.i18n.details_remove_confirm(), { name }), true)) return false;
      try {
        await store.matrixService.removeAdhocChatMember(group.okey, personKey);
        return true;
      } catch (error) {
        console.error('MatrixChatStore.removeAdhocMember: failed:', error);
        await store.alertService.showToast(store.i18n.details_error());
        return false;
      }
    },
  };
}
