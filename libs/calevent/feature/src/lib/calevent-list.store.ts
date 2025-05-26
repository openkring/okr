import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { chipMatches, debugListLoaded, nameMatches } from '@bk2/shared/util';
import { AllCategories, CalEventCollection, CalEventModel, CalEventType, ModelType } from '@bk2/shared/models';
import { categoryMatches } from '@bk2/shared/categories';
import { getSystemQuery, searchData } from '@bk2/shared/data';

import { AppStore } from '@bk2/auth/feature';

import { isCalEvent } from '@bk2/calevent/util';
import { CalEventEditModalComponent } from './calevent-edit.modal';

export type CalEventListState = {
  calendarName: string;
  searchTerm: string;
  selectedTag: string;
  selectedCategory: CalEventType | typeof AllCategories;
};

export const initialState: CalEventListState = {
  calendarName: '',
  searchTerm: '',
  selectedTag: '',
  selectedCategory: AllCategories,
};

export const CalEventListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    calEventService: inject(CalEventService),
    appStore: inject(AppStore),
    firestore: inject(FIRESTORE),
    env: inject(ENV),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    calEventResource: rxResource({
      loader: () => {
        const calEvents$ = searchData<CalEventModel>(store.firestore, CalEventCollection, getSystemQuery(store.env.owner.tenantId), 'name', 'asc');
        debugListLoaded<CalEventModel>('CalEventListStore.calEvents', calEvents$, store.appStore.currentUser());
        return calEvents$;
      }
    })
  })),

  withComputed((state) => {
    return {
      calEvents: computed(() => {
        if (state.calendarName() === 'all') {
          return state.calEventResource.value() ?? [];
        } else {
          return state.calEventResource.value()?.filter((calEvent: CalEventModel) => calEvent.calendars.includes(state.calendarName())) ?? [];
        }
      }),
      isLoading: computed(() => state.calEventResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      calEventsCount: computed(() => state.calEvents().length),
      currentUser: computed(() => state.appStore.currentUser()),
      filteredCalEvents: computed(() => 
        state.calEvents()?.filter((calEvent: CalEventModel) => 
          nameMatches(calEvent.index, state.searchTerm()) && 
          categoryMatches(calEvent.type, state.selectedCategory()) &&
          chipMatches(calEvent.tags, state.selectedTag()))
      )
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.calEventResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setCalendarName(calendarName: string) {
        patchState(store, { calendarName });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedCategory(selectedCategory: CalEventType | typeof AllCategories) {
        patchState(store, { selectedCategory });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.CalEvent);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        const _calEvent = new CalEventModel(store.env.owner.tenantId);
        const _modal = await store.modalController.create({
          component: CalEventEditModalComponent,
          componentProps: {
            event: _calEvent,
            currentUser: store.currentUser(),
            calEventTags: this.getTags()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isCalEvent(data, store.env.owner.tenantId)) {
            await store.calEventService.create(data, store.currentUser());
          }
        }
      },

      async edit(calEvent: CalEventModel): Promise<void> {
        const _modal = await store.modalController.create({
          component: CalEventEditModalComponent,
          componentProps: {
            event: calEvent,
            currentUser: store.currentUser(),
            calEventTags: this.getTags()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isCalEvent(data, store.env.owner.tenantId)) {
            await store.calEventService.update(data);
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`CalEventListStore.export(${type}) is not yet implemented.`);
      },

      async delete(event: CalEventModel): Promise<void> {
        await store.calEventService.delete(event);
        this.reset();
      },
    }
  })
);
