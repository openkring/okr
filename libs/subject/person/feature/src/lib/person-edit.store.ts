import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { AddressModel, ModelType, PersonModel, ResourceModel } from '@bk2/shared/models';
import { PersonService } from '@bk2/person/data';
import { Observable, of } from 'rxjs';
import { AppStore } from '@bk2/auth/feature';
import { convertFormToPerson, PersonFormModel } from '@bk2/person/util';
import { AppNavigationService, debugItemLoaded, debugListLoaded } from '@bk2/shared/util';

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
    modalController: inject(ModalController),    
  })),

  withProps((store) => ({
    personResource: rxResource({
      request: () => ({
        personKey: store.personKey()
      }),
      loader: ({request}) => {
        if (!request.personKey) return of(undefined);
        const _person$ = store.personService.read(request.personKey);
        debugItemLoaded('PersonEditStore.person', _person$, store.appStore.currentUser());
        return _person$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      person: computed(() => state.personResource.value() ?? new PersonModel(state.appStore.env.owner.tenantId)),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource() ?? new ResourceModel(state.appStore.env.owner.tenantId)),
      tenantId: computed(() => state.appStore.env.owner.tenantId),
    };
  }),

  withProps((store) => ({
    addressesResource: rxResource({
      request: () => ({
        person: store.person()
      }),
      loader: ({request}) => {
        let addresses$: Observable<AddressModel[]> = of([]);
        if (request.person) {
          addresses$ = store.personService.listAddresses(request.person);
          debugListLoaded('PersonEditStore.addresses', addresses$, store.appStore.currentUser());
        }
        return addresses$;
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
        const _person = convertFormToPerson(store.person(), vm, store.appStore.env.owner.tenantId);
        await (!_person.bkey ? store.personService.create(_person) : store.personService.update(_person));
        store.appNavigationService.back();
      }
    }
  }),
);
