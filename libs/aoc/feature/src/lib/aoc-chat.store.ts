import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, from, of } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { AlertController, ToastController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { showToast } from '@bk2/shared-util-angular';
import { AOC_I18N_KEYS } from '@bk2/aoc-util';

// ─── types mirroring the cloud-function interfaces ───────────────────────────
export interface AdminRoom {
  roomId: string;
  name: string;
  canonicalAlias?: string;
  joinedMembers: number;
  creator?: string;
  public: boolean;
}

export interface RoomDetails {
  id: string;
  name: string;
  normalizedName: string;
  isDirect: boolean;
  isPublic: boolean;
  creator: string;
  avatarUrl?: string;
  aliases: string[];
  topic?: string;
  numberOfJoinedMembers: number;
  numberOfInvitedMembers: number;
}

export interface RoomMemberInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  membership: string;
  powerLevel: number;
}

export interface MemberDetails {
  userId: string;
  name: string;
  rawDisplayName: string;
  powerLevel: number;
  membership?: string;
  avatarUrl?: string;
}
// ─────────────────────────────────────────────────────────────────────────────

export type DetailsTarget = 'room' | 'member';

export type AocChatState = {
  selectedPersonKey: string | undefined;
  selectedRoomId: string | undefined;
  selectedMemberId: string | undefined;
  detailsTarget: DetailsTarget | undefined;
};

const initialState: AocChatState = {
  selectedPersonKey: undefined,
  selectedRoomId: undefined,
  selectedMemberId: undefined,
  detailsTarget: undefined,
};

function getFn() {
  return getFunctions(getApp(), 'europe-west6');
}

export const AocChatStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),

  // ─── rxResources ────────────────────────────────────────────────────────────
  withProps(store => ({

    /** All rooms (filtered by personKey when set). */
    roomsResource: rxResource({
      params: () => ({ selectedPersonKey: store.selectedPersonKey() }),
      stream: ({ params }) => {
        const fn = httpsCallable<{ personKey?: string }, { rooms: AdminRoom[]; total: number }>(
          getFn(), 'listMatrixRooms'
        );
        return from(
          fn(params.selectedPersonKey ? { personKey: params.selectedPersonKey } : {})
            .then(r => r.data.rooms)
        );
      },
    }),

    /** Members of the currently selected room. */
    membersResource: rxResource({
      params: () => ({ selectedRoomId: store.selectedRoomId() }),
      stream: ({ params }) => {
        if (!params.selectedRoomId) return of([] as RoomMemberInfo[]);
        const fn = httpsCallable<{ roomId: string }, { members: RoomMemberInfo[] }>(
          getFn(), 'getAllMembersFromRoom'
        );
        return from(
          fn({ roomId: params.selectedRoomId }).then(r => r.data.members ?? [])
        );
      },
    }),

    /** Details for the selected room (3rd column). */
    roomDetailsResource: rxResource({
      params: () => ({
        selectedRoomId: store.selectedRoomId(),
        detailsTarget: store.detailsTarget(),
      }),
      stream: ({ params }) => {
        if (!params.selectedRoomId || params.detailsTarget !== 'room') return of(undefined);
        const fn = httpsCallable<{ roomId: string }, RoomDetails>(getFn(), 'getRoomDetails');
        return from(fn({ roomId: params.selectedRoomId }).then(r => r.data));
      },
    }),

    /** Details for the selected member (3rd column). */
    memberDetailsResource: rxResource({
      params: () => ({
        selectedMemberId: store.selectedMemberId(),
        selectedRoomId: store.selectedRoomId(),
        detailsTarget: store.detailsTarget(),
      }),
      stream: ({ params }) => {
        if (!params.selectedMemberId || params.detailsTarget !== 'member') return of(undefined);
        const fn = httpsCallable<{ userId: string; roomId?: string }, MemberDetails>(
          getFn(), 'getMemberDetails'
        );
        return from(
          fn({ userId: params.selectedMemberId, roomId: params.selectedRoomId ?? undefined })
            .then(r => r.data)
        );
      },
    }),
  })),

  // ─── computed ───────────────────────────────────────────────────────────────
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
    isLoadingRooms: computed(() => state.roomsResource.isLoading()),
    isLoadingMembers: computed(() => state.membersResource.isLoading()),
    rooms: computed(() => state.roomsResource.value() ?? []),
    members: computed(() => state.membersResource.value() ?? []),
    roomDetails: computed(() => state.roomDetailsResource.value()),
    memberDetails: computed(() => state.memberDetailsResource.value()),
  })),

  // ─── methods ────────────────────────────────────────────────────────────────
  withMethods(store => ({

    selectPerson(personKey: string | undefined): void {
      patchState(store, {
        selectedPersonKey: personKey || undefined,
        selectedRoomId: undefined,
        selectedMemberId: undefined,
        detailsTarget: undefined,
      });
    },

    selectRoom(roomId: string | undefined): void {
      patchState(store, {
        selectedRoomId: roomId,
        selectedMemberId: undefined,
        detailsTarget: undefined,
      });
    },

    showRoomDetails(roomId: string): void {
      patchState(store, { selectedRoomId: roomId, detailsTarget: 'room', selectedMemberId: undefined });
    },

    showRoomMembers(roomId: string): void {
      patchState(store, { selectedRoomId: roomId, detailsTarget: undefined, selectedMemberId: undefined });
    },

    showMemberDetails(userId: string): void {
      patchState(store, { selectedMemberId: userId, detailsTarget: 'member' });
    },

    // ─── room actions ──────────────────────────────────────────────────────────

    async renameRoom(roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.chat_room_rename(),
        inputs: [{ name: 'name', type: 'text', placeholder: store.i18n.chat_room_rename_newname() }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_room_rename_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.name) return;
      const newName = (data.values.name as string).trim();
      if (!newName) return;
      try {
        const fn = httpsCallable<{ roomId: string; name: string }, { roomId: string; name: string }>(
          getFn(), 'renameMatrixRoom'
        );
        await fn({ roomId, name: newName });
        store.roomsResource.reload();
        await showToast(store.toastController, `${store.i18n.chat_room_rename_conf()}: ${newName}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async deleteRoom(roomId: string): Promise<void> {
      const message = await firstValueFrom(store.i18nService.translate('@aoc/feature.' + 'chat.room.delete.confirm', { roomId }));
      const alert = await store.alertController.create({
        header: store.i18n.chat_room_delete(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_room_delete_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;
      try {
        const fn = httpsCallable<{ roomId: string }, { deleteId: string }>(getFn(), 'deleteMatrixRoom');
        await fn({ roomId });
        if (store.selectedRoomId() === roomId) {
          patchState(store, { selectedRoomId: undefined, detailsTarget: undefined });
        }
        store.roomsResource.reload();
        await showToast(store.toastController, store.i18n.chat_room_delete_conf());
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async addAlias(roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.chat_alias_add(),
        inputs: [{ name: 'alias', type: 'text', placeholder: store.i18n.chat_alias_add_placeholder() }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_alias_add_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.alias) return;
      const aliasName = (data.values.alias as string).trim();
      if (!aliasName) return;
      try {
        const fn = httpsCallable<{ roomId: string; aliasName: string }, { alias: string }>(
          getFn(), 'addMatrixRoomAlias'
        );
        const result = await fn({ roomId, aliasName });
        await showToast(store.toastController, `${store.i18n.chat_alias_add_conf()}: ${result.data.alias}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async inviteToRoom(roomId: string): Promise<void> {
      const defaultPersonKey = store.selectedPersonKey() ?? '';
      const alert = await store.alertController.create({
        header: store.i18n.chat_room_invite(),
        inputs: [{ name: 'personKey', type: 'text', value: defaultPersonKey, placeholder: 'personKey' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_room_invite_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.personKey) return;
      const pk = (data.values.personKey as string).trim();
      if (!pk) return;
      try {
        const fn = httpsCallable<{ roomId: string; personKey: string }, { invited: boolean }>(
          getFn(), 'invitePersonToGroupRoom'
        );
        await fn({ roomId, personKey: pk });
        store.membersResource.reload();
        await showToast(store.toastController, `${pk} ${store.i18n.chat_room_invite_conf()}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async provisionUser(personKey?: string): Promise<void> {
      const defaultKey = personKey ?? store.selectedPersonKey() ?? '';
      const alert = await store.alertController.create({
        header: store.i18n.chat_user_provision(),
        inputs: [{ name: 'personKey', type: 'text', value: defaultKey, placeholder: 'personKey' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_user_provision_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.personKey) return;
      const pk = (data.values.personKey as string).trim();
      if (!pk) return;
      try {
        const fn = httpsCallable<{ personKey: string }, { matrixUserId: string; provisioned: boolean }>(
          getFn(), 'provisionMatrixUser'
        );
        const result = await fn({ personKey: pk });
        await showToast(store.toastController, `${store.i18n.chat_user_provision_conf()}: ${result.data.matrixUserId}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    // ─── member actions ────────────────────────────────────────────────────────

    async kickMember(userId: string, roomId: string): Promise<void> {
      const message = await firstValueFrom(store.i18nService.translate('@aoc/feature.' + 'chat.member.kick.confirm', { userId }));
      const alert = await store.alertController.create({
        header: store.i18n.chat_member_kick(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_member_kick_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      // Extract personKey from userId (@personkey:homeserver → personkey)
      const personKey = userId.replace(/^@/, '').split(':')[0];
      try {
        const fn = httpsCallable<{ roomId: string; personKey: string }, { kicked: boolean }>(
          getFn(), 'kickPersonFromGroupRoom'
        );
        await fn({ roomId, personKey });
        store.membersResource.reload();
        await showToast(store.toastController, `${userId} ${store.i18n.chat_member_kick_conf()}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async deactivateUser(userId: string): Promise<void> {
      const message = await firstValueFrom(store.i18nService.translate('@aoc/feature.' + 'chat.user.deactivate.confirm', { userId }));
      const alert = await store.alertController.create({
        header: store.i18n.chat_user_deactivate(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_user_deactivate_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      const personKey = userId.replace(/^@/, '').split(':')[0];
      try {
        const fn = httpsCallable<{ personKey: string; erase?: boolean }, { matrixUserId: string; deactivated: boolean }>(
          getFn(), 'deactivateMatrixUser'
        );
        const result = await fn({ personKey });
        store.roomsResource.reload();
        store.membersResource.reload();
        await showToast(store.toastController, result.data.deactivated ? `${userId} ${store.i18n.chat_user_deactivate_conf()}` : store.i18n.chat_user_deactivate_notfound());
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    reloadRooms(): void {
      store.roomsResource.reload();
    },

    reloadMembers(): void {
      store.membersResource.reload();
    },
  }))
);
