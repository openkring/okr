import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CalEventCollection, CalEventModel, CategoryListModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { yearMatches } from '@bk2/shared-categories';

import { CalEventService } from '@bk2/calevent-data-access';
import { isCalEvent } from '@bk2/calevent-util';
import { CalEventEditModalComponent } from './calevent-edit.modal';
import { get } from 'http';
import { cu } from '@fullcalendar/core/internal-common';

export type CalEventState = {
  calendarName: string;
  searchTerm: string;
  selectedTag: string;
  selectedCategory: string;
  selectedYear: number;
};

export const initialState: CalEventState = {
  calendarName: '',
  searchTerm: '',
  selectedTag: '',
  selectedCategory: 'all',
  selectedYear: new Date().getFullYear()
};

export const CalEventStore = signalStore(
  withState(initialState),
  withProps(() => ({
    calEventService: inject(CalEventService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    router: inject(Router)
  })),
  withProps((store) => ({
    caleventsResource: rxResource({
      stream: () => {
        const calevents$ = store.firestoreService.searchData<CalEventModel>(CalEventCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
        debugListLoaded<CalEventModel>('CalEventStore.calevents', calevents$, store.appStore.currentUser());
        return calevents$;
      }
    })
  })),

  withComputed((state) => {
    return {
      calEvents: computed(() => {
        if (state.calendarName() === 'all') {
          return state.caleventsResource.value() ?? [];
        } else {
          return state.caleventsResource.value()?.filter((calEvent: CalEventModel) => calEvent.calendars.includes(state.calendarName())) ?? [];
        }
      }),
      isLoading: computed(() => state.caleventsResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      calEventsCount: computed(() => state.calEvents().length),
      currentUser: computed(() => state.appStore.currentUser()),
      filteredCalEvents: computed(() => 
        state.calEvents()?.filter((calEvent: CalEventModel) => 
          nameMatches(calEvent.index, state.searchTerm()) && 
          nameMatches(calEvent.type, state.selectedCategory()) &&
          yearMatches(calEvent.startDate, state.selectedYear()) &&
          chipMatches(calEvent.tags, state.selectedTag()))
      )
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.caleventsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setCalendarName(calendarName: string) {
        patchState(store, { calendarName });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('calevent');
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('calevent_type');
      },

      getPeriodicities(): CategoryListModel {
        return store.appStore.getCategory('periodicity');
      },

      getLocale(): string {
        return store.appStore.appConfig().locale;
      },

      /******************************* actions *************************************** */
      async edit(calEvent?: CalEventModel, readOnly = true): Promise<void> {
        let calevent = calEvent ? calEvent : new CalEventModel(store.appStore.tenantId());
        const modal = await store.modalController.create({
          component: CalEventEditModalComponent,
          componentProps: {
            calevent,
            currentUser: store.currentUser(),
            types: this.getTypes(),
            periodicities: this.getPeriodicities(),
            tags: this.getTags(),
            locale: this.getLocale(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm') {
          if (isCalEvent(data, store.appStore.tenantId())) {
            await calEvent ? store.calEventService.update(data, store.currentUser()): store.calEventService.create(data,  store.currentUser());
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`CalEventStore.export(${type}) is not yet implemented.`);
      },

      async delete(event: CalEventModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.calEventService.delete(event, store.currentUser());
        this.reset();
      },

      async showAlbum(albumUrl: string): Promise<void> {
        if (albumUrl.length > 0) {
          await navigateByUrl(store.router, albumUrl)
        } 
      }
    }
  })
);
