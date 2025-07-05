import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { Observable, of } from 'rxjs';

import { PersonalRelModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';
import { convertDateFormatToString, DateFormat, debugListLoaded, isPersonalRel, isValidAt } from '@bk2/shared/util-core';
import { confirm } from '@bk2/shared/util-angular';
import { selectDate } from '@bk2/shared/ui';

import { AvatarService } from '@bk2/avatar/data-access';

import { PersonalRelService } from '@bk2/personal-rel/data-access';
import { PersonalRelModalsService } from './personal-rel-modals.service';
import { PersonalRelEditModalComponent } from './personal-rel-edit.modal';
import { PersonalRelNewModalComponent } from './personal-rel-new.modal';
import { convertFormToNewPersonalRel, PersonalRelNewFormModel } from '@bk2/personal-rel/util';

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
        let _personalRels$: Observable<PersonalRelModel[]> = of([]);
        if (params.personKey) {
          _personalRels$ = store.personalRelService.listPersonalRelsOfPerson(params.personKey);
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
      /**
       * Show a modal to add a new personalRel.
       * @param subject first person to be related
       * @param object second person to be related
       */
      async add(): Promise<void> {
        const _subject = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
        const _object = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
        if (_subject && _object) {
          const _modal = await store.modalController.create({
            component: PersonalRelNewModalComponent,
            cssClass: 'small-modal',
            componentProps: {
              subject: _subject,
              object: _object,
              currentUser: store.appStore.currentUser()
            }
          });
          _modal.present();
          const { data, role } = await _modal.onDidDismiss();
          if (role === 'confirm') {
            const _personalRel = convertFormToNewPersonalRel(data as PersonalRelNewFormModel, store.appStore.tenantId());
            await store.personalRelService.create(_personalRel, store.appStore.currentUser());
          }
        }
        store.personalRelsResource.reload();
      },

      async edit(personalRel?: PersonalRelModel): Promise<void> {
        let _personalRel = personalRel;
        _personalRel ??= new PersonalRelModel(store.appStore.tenantId());
        
        const _modal = await store.modalController.create({
          component: PersonalRelEditModalComponent,
          componentProps: {
            personalRel: _personalRel,
            currentUser: store.appStore.currentUser()
          }
        });
        _modal.present();
        await _modal.onWillDismiss();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isPersonalRel(data, store.appStore.tenantId())) {
            await (!data.bkey ? 
              store.personalRelService.create(data, store.appStore.currentUser()) : 
              store.personalRelService.update(data, store.appStore.currentUser()));
          }
        }
        store.personalRelsResource.reload();
      },

      async end(personalRel?: PersonalRelModel): Promise<void> {
        if (personalRel) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.personalRelService.endPersonalRelByDate(personalRel, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.personalRelsResource.reload();  
        }
      },

      async delete(personalRel?: PersonalRelModel): Promise<void> {
        if (personalRel) {
          const _result = await confirm(store.alertController, '@personalRel.operation.delete.confirm', true);
          if (_result === true) {
            await store.personalRelService.delete(personalRel, store.appStore.currentUser());
            store.personalRelsResource.reload();
          } 
        }
      }
    }
  })
);
