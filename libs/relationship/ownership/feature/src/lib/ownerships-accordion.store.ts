import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { ModelType, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { convertDateFormatToString, DateFormat, debugListLoaded, isValidAt } from '@bk2/shared-util-core';

import { OwnershipService } from '@bk2/relationship-ownership-data-access';

import { OwnershipModalsService } from './ownership-modals.service';

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
    ownershipModalsService: inject(OwnershipModalsService),
    appStore: inject(AppStore),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    ownershipsResource: rxResource({
      params: () => ({
        owner: store.owner()
      }),
      stream: ({params}) => {
        if (!params.owner) return of([]);
        const ownerships$ = store.ownershipService.listOwnershipsOfOwner(params.owner.bkey, store.ownerModelType());        
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
          await store.ownershipModalsService.add(owner, ownerModelType, defaultResource);
          store.ownershipsResource.reload();
        }
      },

      async edit(ownership?: OwnershipModel): Promise<void> {
        await store.ownershipModalsService.edit(ownership);
        store.ownershipsResource.reload();
      },

      /**
       * End an existing Ownership.
       * We do not archive ownerships as we want to make them visible in the lists.
       * Therefore, we end an ownership by setting its validTo date.
       * @param ownership the Ownership to delete, its bkey needs to be valid so that we can find it in the database. 
       */
      async end(ownership: OwnershipModel): Promise<void> {
        if (ownership) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.ownershipService.endOwnershipByDate(ownership, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
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
