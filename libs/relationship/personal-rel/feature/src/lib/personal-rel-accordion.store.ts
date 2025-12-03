import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { PersonalRelModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { convertDateFormatToString, DateFormat, debugListLoaded, isPersonalRel, isValidAt } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';

import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';
import { convertFormToNewPersonalRel, PersonalRelNewFormModel } from '@bk2/relationship-personal-rel-util';

import { PersonalRelEditModalComponent } from './personal-rel-edit.modal';
import { PersonalRelModalsService } from './personal-rel-modals.service';
import { PersonalRelNewModalComponent } from './personal-rel-new.modal';

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
    personalRelModalsService: inject(PersonalRelModalsService),
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({
     personalRelsResource: rxResource({
      params: () => ({
        personKey: store.personKey(),
      }),
      stream: ({params}) => {
        let personalRels$: Observable<PersonalRelModel[]> = of([]);
        if (params.personKey) {
          personalRels$ = store.personalRelService.listPersonalRelsOfPerson(params.personKey);
        }
        debugListLoaded('PersonalRelAccordionStore.personalRels (subject)', personalRels$, store.appStore.currentUser());
        return personalRels$;
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
      /**
       * Show a modal to add a new personalRel.
       */
      async add(readOnly = true): Promise<void> {
        if(readOnly === false) {
          const subject = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
          const object = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
          if (subject && object) {
            const modal = await store.modalController.create({
              component: PersonalRelNewModalComponent,
              cssClass: 'small-modal',
              componentProps: {
                subject: subject,
                object: object,
                currentUser: store.appStore.currentUser()
              }
            });
            modal.present();
            const { data, role } = await modal.onDidDismiss();
            if (role === 'confirm') {
              const personalRel = convertFormToNewPersonalRel(data as PersonalRelNewFormModel, store.appStore.tenantId());
              await store.personalRelService.create(personalRel, store.appStore.currentUser());
            }
          }
          store.personalRelsResource.reload();
        }
      },

      async edit(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        personalRel ??= new PersonalRelModel(store.appStore.tenantId());
        
        const modal = await store.modalController.create({
          component: PersonalRelEditModalComponent,
          componentProps: {
            personalRel: personalRel,
            currentUser: store.appStore.currentUser(),
            readOnly
          }
        });
        modal.present();
        await modal.onWillDismiss();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && readOnly === false) {
          if (isPersonalRel(data, store.appStore.tenantId())) {
            await (!data.bkey ? 
              store.personalRelService.create(data, store.appStore.currentUser()) : 
              store.personalRelService.update(data, store.appStore.currentUser()));
          }
        }
        store.personalRelsResource.reload();
      },

      async end(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        if (personalRel && readOnly === false) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.personalRelService.endPersonalRelByDate(personalRel, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.personalRelsResource.reload();  
        }
      },

      async delete(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        if (personalRel && readOnly === false) {
          const result = await confirm(store.alertController, '@personalRel.operation.delete.confirm', true);
          if (result === true) {
            await store.personalRelService.delete(personalRel, store.appStore.currentUser());
            store.personalRelsResource.reload();
          } 
        }
      }
    }
  })
);
