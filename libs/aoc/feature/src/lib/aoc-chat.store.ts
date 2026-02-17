import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';
import { Room } from 'matrix-js-sdk';

import { AppStore } from '@bk2/shared-feature';
import { LogInfo, CategoryListModel} from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { AlertController } from '@ionic/angular/standalone';

export type RoomType = 'public' | 'private' | 'direct';

export type AocChatStore = {
  roomType: RoomType | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocChatStore = {
  roomType: undefined,
  log: [],
    logTitle: '',
  };

export const AocChatStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    alertController: inject(AlertController)
  })),
  withProps(store => ({
    roomResource: rxResource({
      params: () => ({
        roomType: store.roomType(),
      }),
      stream: ({ params }): Observable<Room[] | undefined> => {
        return of([]);
      },
    }),
  })),

  withComputed(state => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.env.tenantId),
      isLoading: computed(() => state.roomResource.isLoading()),
      allRooms: computed(() => state.roomResource.value() ?? []),
      //privateRooms: computed(() => (state.roomResource.value() ?? []).filter(room => room.preset === 'private')),
    };
  }),

  withMethods(store => {
    return {
      /******************************** setters (filter) ******************************************* */
      setRoomType(roomType: RoomType | undefined): void {
        patchState(store, { roomType, log: [], logTitle: '' });
      },

      createIndex<T>(collection: string, generateIndexFn: (model: T) => string, orderBy = 'name'): void {
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        store.appStore.firestoreService.searchData<T>(collection, dbQuery, orderBy, 'asc')
          .subscribe(async (data) => {
            for (const model of data) {
              const oldIndex = (model as any).index;
              console.log(`Generating index for model ${collection}/${(model as any).bkey}...`);
              const newIndex = generateIndexFn(model);
              if (oldIndex !== newIndex) {
                (model as any).index = newIndex;
                console.log(`  - updating index from ${oldIndex} to ${newIndex} ...`);
                // await store.appStore.firestoreService.updateModel<T>(collection, model);
              }
            }
          });
      },

      /**
         * Admin: Get all rooms on the server (requires admin access token)
         * Returns: [{ roomId, name, topic, aliases, type }]
         */
/*         async getAllRoomsAdmin(): Promise<Array<{ roomId: string; name?: string; topic?: string; aliases?: string[]; type: 'public' | 'private' | 'direct'; }>> {
            if (!this.client) throw new Error('Client not initialized');
            // Use the admin API endpoint: /_synapse/admin/v1/rooms
            // Requires admin access token (same as used for login)
            const baseUrl = (this.client as any).baseUrl || '';
            const accessToken = (this.client as any).getAccessToken?.() || (this.client as any).credentials?.accessToken;
            if (!accessToken) throw new Error('No access token available');

            const url = `${baseUrl}/_synapse/admin/v1/rooms`;
            const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            });
            if (!response.ok) {
            throw new Error(`Failed to fetch rooms: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            // data.rooms: [{ room_id, name, topic, canonical_alias, joined_members, ... }]
            // For each room, fetch aliases and type
            const rooms = data.rooms || [];
            // Optionally, fetch aliases for each room (requires another API call per room)
            // For now, just include canonical_alias as aliases if present
            return rooms.map((room: any) => {
            let type: 'public' | 'private' | 'direct' = 'private';
            if (room['join_rules'] === 'public' || room['is_public']) type = 'public';
            // Direct rooms are not directly marked, but can be inferred if needed
            return {
                roomId: room.room_id,
                name: room.name,
                topic: room.topic,
                aliases: room.canonical_alias ? [room.canonical_alias] : [],
                type,
            };
          });
        } */
    };
  })
);
