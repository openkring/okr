import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { from, of } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { AlertController, ToastController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { showToast } from '@bk2/shared-util-angular';

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
        header: 'Raum umbenennen',
        inputs: [{ name: 'name', type: 'text', placeholder: 'Neuer Name' }],
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Umbenennen', role: 'confirm' },
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
        await showToast(store.toastController, `Raum umbenannt: ${newName}`);
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
      }
    },

    async deleteRoom(roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: 'Raum löschen',
        message: `Raum ${roomId} wirklich löschen? Alle Nachrichten werden entfernt.`,
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Löschen', role: 'confirm', cssClass: 'danger' },
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
        await showToast(store.toastController, 'Raum gelöscht');
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
      }
    },

    async addAlias(roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: 'Alias hinzufügen',
        inputs: [{ name: 'alias', type: 'text', placeholder: 'alias-name (ohne # und :homeserver)' }],
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Hinzufügen', role: 'confirm' },
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
        await showToast(store.toastController, `Alias hinzugefügt: ${result.data.alias}`);
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
      }
    },

    async inviteToRoom(roomId: string): Promise<void> {
      const defaultPersonKey = store.selectedPersonKey() ?? '';
      const alert = await store.alertController.create({
        header: 'Person einladen',
        inputs: [{ name: 'personKey', type: 'text', value: defaultPersonKey, placeholder: 'personKey' }],
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Einladen', role: 'confirm' },
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
        await showToast(store.toastController, `${pk} eingeladen`);
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
      }
    },

    async provisionUser(personKey?: string): Promise<void> {
      const defaultKey = personKey ?? store.selectedPersonKey() ?? '';
      const alert = await store.alertController.create({
        header: 'Matrix User anlegen',
        inputs: [{ name: 'personKey', type: 'text', value: defaultKey, placeholder: 'personKey' }],
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Anlegen', role: 'confirm' },
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
        await showToast(store.toastController, `User angelegt: ${result.data.matrixUserId}`);
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
      }
    },

    // ─── member actions ────────────────────────────────────────────────────────

    async kickMember(userId: string, roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: 'Mitglied entfernen',
        message: `${userId} aus dem Raum entfernen?`,
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Entfernen', role: 'confirm', cssClass: 'danger' },
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
        await showToast(store.toastController, `${userId} entfernt`);
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
      }
    },

    async deactivateUser(userId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: 'Matrix User deaktivieren',
        message: `${userId} deaktivieren? Der User kann sich danach nicht mehr anmelden.`,
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Deaktivieren', role: 'confirm', cssClass: 'danger' },
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
        await showToast(store.toastController, result.data.deactivated ? `${userId} deaktiviert` : `User nicht gefunden`);
      } catch (e) {
        await showToast(store.toastController, `Fehler: ${(e as Error).message}`);
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
