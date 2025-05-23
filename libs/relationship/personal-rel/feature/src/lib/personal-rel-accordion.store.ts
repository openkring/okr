import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared/config';
import { PersonalRelModel } from '@bk2/shared/models';
import { debugListLoaded, isValidAt } from '@bk2/shared/util';
import { confirm } from '@bk2/shared/i18n';

import { AvatarService } from '@bk2/avatar/data';
import { AppStore } from '@bk2/auth/feature';

import { PersonalRelService } from '@bk2/personal-rel/data';

export type PersonalRelAccordionState = {
  personKey: string | undefined;
  showOnlyCurrent: boolean;
};

const initialState: PersonalRelAccordionState = {
  personKey: undefined,
  showOnlyCurrent: true,
};

/** 
 * This store can be used for personal relationship accordions.
 */
export const PersonalRelAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personalRelService: inject(PersonalRelService),
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({
     personalRelsResource: rxResource({
      request: () => ({
        personKey: store.personKey(),
      }),
      loader: ({request}) => {
        let _personalRels$: Observable<PersonalRelModel[]> = of([]);
        if (request.personKey) {
          _personalRels$ = store.personalRelService.listPersonalRelsOfPerson(request.personKey);
        }
        debugListLoaded('PersonalRelAccordionStore.personalRels (subject)', _personalRels$, store.appStore.currentUser());
        return _personalRels$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allPersonalRels: computed(() => state.personalRelsResource.value() ?? []),
      currentPersonalRels: computed(() => state.personalRelsResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      personalRels: computed(() => state.showOnlyCurrent() ? state.personalRelsResource.value() ?? [] : state.personalRelsResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),  
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.personalRelsResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters ******************************************* */
      setPersonKey(personKey: string) {
        patchState(store, { personKey });
        store.personalRelsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        await store.personalRelService.add(store.appStore.currentPerson(), store.appStore.currentPerson());
        store.personalRelsResource.reload();
      },

      async edit(personalRel?: PersonalRelModel): Promise<void> {
        await store.personalRelService.edit(personalRel);
        store.personalRelsResource.reload();
      },

      async end(personalRel?: PersonalRelModel): Promise<void> {
        if (personalRel) {
          await store.personalRelService.end(personalRel);
          store.personalRelsResource.reload();  
        }
      },

      async delete(personalRel?: PersonalRelModel): Promise<void> {
        if (personalRel) {
          const _result = await confirm(store.alertController, '@personalRel.operation.delete.confirm', true);
          if (_result === true) {
            await store.personalRelService.delete(personalRel);
            store.personalRelsResource.reload();
          } 
        }
      }
    }
  })
);
