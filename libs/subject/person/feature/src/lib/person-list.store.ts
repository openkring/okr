import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared/config';
import { AppNavigationService, chipMatches, debugListLoaded, hasRole, nameMatches, navigateByUrl } from '@bk2/shared/util';
import { categoryMatches } from '@bk2/shared/categories';
import { AllCategories, GenderType, ModelType, PersonModel } from '@bk2/shared/models';
import { PersonService } from '@bk2/person/data-access';
import { AppStore } from '@bk2/auth/feature';
import { copyToClipboardWithConfirmation } from '@bk2/shared/i18n';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { CategoryService } from '@bk2/category/data-access';

export type PersonListState = {
  orgId: string;
  searchTerm: string;
  selectedTag: string;
  selectedGender: GenderType | typeof AllCategories;
};

export const initialState: PersonListState = {
  orgId: '',
  searchTerm: '',
  selectedTag: '',
  selectedGender: AllCategories,
};

export const PersonListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    categoryService: inject(CategoryService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    toastController: inject(ToastController) 
  })),
  withProps((store) => ({
    personsResource: rxResource({
      loader: () => {
        const persons$ = store.personService.list();
        debugListLoaded('PersonListStore.persons$', persons$, store.appStore.currentUser());   
        return persons$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      persons: computed(() => state.personsResource.value()),
      deceased: computed(() => state.personsResource.value()?.filter((person: PersonModel) => person.dateOfDeath !== undefined && person.dateOfDeath.length > 0) ?? []),
      showGender: computed(() => hasRole(state.env.privacy.showGender, state.appStore.currentUser())),
      currentUser: computed(() => state.appStore.currentUser()),
      toastLength: computed(() => state.appStore.toastLength()),
      tenantId: computed(() => state.env.owner.tenantId),
      membershipCategoryKey: computed(() => 'mcat_' + state.orgId()),
    };
  }),

  withProps((store) => ({
    mcatResource: rxResource({
      request: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      loader: ({request}) => {
        if (!request.mcatId || request.mcatId.length === 0) return of(undefined);
        return store.categoryService.read(request.mcatId);
      }
    }),
  })),
  withComputed((state) => {
    return {
      // all persons
      personsCount: computed(() => state.personsResource.value()?.length ?? 0), 
      filteredPersons: computed(() => 
        state.personsResource.value()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          categoryMatches(person.gender, state.selectedGender()) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      
      // deceased persons
      deceasedCount: computed(() => state.deceased().length ?? 0), 
      filteredDeceased: computed(() => 
        state.deceased()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          categoryMatches(person.gender, state.selectedGender()) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      membershipCategory: computed(() => state.mcatResource.value() ?? undefined),
      isLoading: computed(() => state.personsResource.isLoading() || state.mcatResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.personsResource.reload();
      },

      reload() {
        store.personsResource.reload();
      },
      
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedGender(selectedGender: GenderType | typeof AllCategories) {
        patchState(store, { selectedGender });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Person);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        await store.personService.add(store.currentUser());
        store.personsResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`PersonListStore.export(${type}) ist not yet implemented`);
      },

      async edit(person: PersonModel): Promise<void> {
        store.appNavigationService.pushLink('/person/all' );
        await navigateByUrl(store.router, `/person/${person.bkey}`);
        store.personsResource.reload();
      },

      async delete(person: PersonModel): Promise<void> {
        await store.personService.delete(person);
        this.reset();
      },

      async copyEmailAddresses(): Promise<void> {
        const _allEmails = store.filteredPersons().map(_person => _person.fav_email);
        const _emails = _allEmails.filter(e => e); // this filters all empty emails, because '' is a falsy value
        await copyToClipboardWithConfirmation(store.toastController, store.toastLength(), _emails.toString() ?? '', '@subject.address.operation.emailCopy.conf');
      }
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { orgId: store.env.owner.tenantId });
    }
  })
);
