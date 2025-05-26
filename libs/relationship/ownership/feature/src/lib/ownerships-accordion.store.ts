import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController } from '@ionic/angular/standalone';

import { ModelType, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/auth/feature';
import { OwnershipService } from '@bk2/ownership/data-access';
import { debugListLoaded, isValidAt } from '@bk2/shared/util';
import { of } from 'rxjs';
import { confirm } from '@bk2/shared/i18n';

export type OwnershipAccordionState = {
  owner: PersonModel | OrgModel |  undefined;
  ownerModelType: ModelType;
  showOnlyCurrent: boolean;
};

const initialState: OwnershipAccordionState = {
  owner: undefined,
  ownerModelType: ModelType.Person,
  showOnlyCurrent: false,
};

export const OwnershipAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    ownershipService: inject(OwnershipService),
    appStore: inject(AppStore),
    alertController: inject(AlertController) 
  })),
  withProps((store) => ({
    ownershipsResource: rxResource({
      request: () => ({
        owner: store.owner()
      }),
      loader: ({request}) => {
        if (!request.owner) return of([]);
        const ownerships$ = store.ownershipService.listOwnershipsOfOwner(request.owner.bkey, store.ownerModelType());        
        debugListLoaded('OwnershipAccordionStore.ownerships (Person)', ownerships$, store.appStore.currentUser());        
        return ownerships$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      allOwnerships: computed(() => state.ownershipsResource.value() ?? []),
      currentOwnerships: computed(() => state.ownershipsResource.value()?.filter(o => isValidAt(o.validFrom, o.validTo)) ?? []),
      ownerships: computed(() => state.showOnlyCurrent() ? state.ownershipsResource.value() ?? [] : state.ownershipsResource.value()?.filter(o => isValidAt(o.validFrom, o.validTo)) ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.ownershipsResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      /******************************** setters ******************************************* */
      setOwner(owner: PersonModel | OrgModel, ownerModelType: ModelType): void {
        patchState(store, { owner, ownerModelType });
        store.ownershipsResource.reload();
      },      
      
      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      async export(): Promise<void> {
        console.log('OwnershipsAccordionStore.export() is not yet implemented.');
      },

      async add(owner: PersonModel | OrgModel, ownerModelType: ModelType, defaultResource: ResourceModel): Promise<void> {
        if (defaultResource.bkey.length > 0) {    // check if resource is valid
          await store.ownershipService.add(owner, ownerModelType, defaultResource);
          store.ownershipsResource.reload();
        }
      },

      async edit(ownership?: OwnershipModel): Promise<void> {
        await store.ownershipService.edit(ownership);
        store.ownershipsResource.reload();
      },

      async end(ownership?: OwnershipModel): Promise<void> {
        if (ownership) {
          await store.ownershipService.end(ownership);
          store.ownershipsResource.reload();  
        }
      },

      async delete(ownership?: OwnershipModel): Promise<void> {
        if (ownership) {
          const _result = await confirm(store.alertController, '@ownership.operation.delete.confirm', true);
          if (_result === true) {
            await store.ownershipService.delete(ownership);
            store.ownershipsResource.reload(); 
          }
        }
      },
    }
  })
);
