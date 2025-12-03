import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';
import { Photo } from '@capacitor/camera';

import { AppStore } from '@bk2/shared-feature';
import { OrgModel, OrgModelName } from '@bk2/shared-models';
import { debugItemLoaded } from '@bk2/shared-util-core';

import { OrgService } from '@bk2/subject-org-data-access';
import { convertFormToOrg, OrgFormModel } from '@bk2/subject-org-util';
import { AvatarService } from '@bk2/avatar-data-access';

export type OrgEditState = {
  orgKey: string | undefined;
};

export const initialState: OrgEditState = {
  orgKey: undefined,
};

export const OrgEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    orgService: inject(OrgService),
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
  })),

  withProps((store) => ({
    orgResource: rxResource({
      params: () => ({
        orgKey: store.orgKey()
      }),
      stream: ({params}) => {
        if (!params.orgKey) return of(undefined);
        const org$ = store.orgService.read(params.orgKey);
        debugItemLoaded('OrgEditStore.org', org$, store.appStore.currentUser());
        return org$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      org: computed(() => state.orgResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.appStore.env.tenantId),
      isLoading: computed(() => state.orgResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      /************************************ SETTERS ************************************* */      
      setOrgKey(orgKey: string): void {
        patchState(store, { orgKey });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(OrgModelName);
      },
      
      /************************************ ACTIONS ************************************* */
      async save(formData?: OrgFormModel): Promise<void> {
        const org = convertFormToOrg(formData, store.org());
        await (!org.bkey ? 
          store.orgService.create(org, store.currentUser()) : 
          store.orgService.update(org, store.currentUser()));
      },

      async saveAvatar(photo: Photo): Promise<void> {
        const org = store.org();
        if (!org) return;
        await store.avatarService.saveAvatarPhoto(photo, org.bkey, store.tenantId(), OrgModelName);
      }
    }
  }),
);
