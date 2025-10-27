import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, ModelType, PersonCollection, PersonModel, ResourceModel } from '@bk2/shared-models';
import { AppNavigationService } from '@bk2/shared-util-angular';
import { debugItemLoaded, debugListLoaded } from '@bk2/shared-util-core';

import { PersonService } from '@bk2/subject-person-data-access';
import { convertFormToPerson, PersonFormModel } from '@bk2/subject-person-util';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';

/**
 * the personEditPage is setting the personKey.
 * The store reads the corresponding person and updates the state with the person.
 * Then, the person is used to read its addresses.
 */
export type PersonEditState = {
  personKey: string | undefined;
};

export const initialState: PersonEditState = {
  personKey: undefined,
};

export const PersonEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController)
  })),

  withProps((store) => ({
    personResource: rxResource({
      params: () => ({
        personKey: store.personKey()
      }),
      stream: ({params}) => {
        if (!params.personKey?.length) return new Observable<PersonModel>(() => {});
        const person$ = store.personService.read(params.personKey);
        debugItemLoaded('PersonEditStore.person', person$, store.appStore.currentUser());
        return person$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      person: computed(() => state.personResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource() ?? new ResourceModel(state.appStore.env.tenantId)),
      tenantId: computed(() => state.appStore.env.tenantId),
      privacySettings: computed(() => state.appStore.privacySettings()),
    };
  }),

  withProps((store) => ({
    addressesResource: rxResource({
      params: () => ({
        person: store.person()
      }),
      stream: ({params}) => {
                if (!params.person) return of([]);
                const _ref = query(collection(store.appStore.firestore, `${PersonCollection}/${params.person.bkey}/${AddressCollection}`));
                return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
        
/*         if (!params.person?.bkey?.length) return new Observable<AddressModel[]>(() => {});    
        const addresses$ = store.personService.listAddresses(params.person);
        debugListLoaded('PersonEditStore.addresses', addresses$, store.appStore.currentUser());
        return addresses$; */
      }
    }),
  })),

  withComputed((state) => {
    return {
      addresses: computed(() => state.addressesResource.value() ?? []),
      isLoading: computed(() => state.addressesResource.isLoading() || state.personResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      
      /************************************ SETTERS ************************************* */
      setPersonKey(personKey: string): void {
        patchState(store, { personKey });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Person);
      },

      /************************************ ACTIONS ************************************* */
      reloadAddresses(): void {
        store.addressesResource.reload();
      },

      async save(vm: PersonFormModel): Promise<void> {
        const _person = convertFormToPerson(store.person(), vm, store.appStore.env.tenantId);
        await (!_person.bkey ? 
          store.personService.create(_person, store.currentUser()) : 
          store.personService.update(_person, store.currentUser()));
        store.appNavigationService.back();
      }
    }
  }),
);
