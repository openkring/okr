import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { map, of } from 'rxjs';

import { CalEventModel } from '@bk2/shared/models';
import { convertCalEventToFullCalendar } from '@bk2/calevent/util';
import { AppStore } from '@bk2/shared/feature';

import { CalEventService } from '@bk2/calevent/data-access';

export type CalendarState = {
  calendarName: string | undefined;
};

export const initialState: CalendarState = {
  calendarName: '',
};

export const CalendarStore = signalStore(
  withState(initialState),
  withProps(() => ({
    calEventService: inject(CalEventService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),  
  })),
  withProps((store) => ({
    calEventsResource: rxResource({
      request: () => ({
        calendarName: store.calendarName()
      }),
      loader: ({request}) => {
        const _calName = request.calendarName;
        if (!_calName || _calName.length === 0) {
          return of([]);
        } else {
          if (_calName === 'all') {
            return store.calEventService.list();
          }
          return store.calEventService.list()
            .pipe(
              map((calEvents: CalEventModel[]) => 
                calEvents.filter((calEvent: CalEventModel) => 
                  calEvent.calendars.includes(_calName)))
            );
        }
      }
    })
  })),

  withComputed((state) => {
    return {
      calEvents: computed(() => state.calEventsResource.value()),
      calEventsCount: computed(() => state.calEventsResource.value()?.length ?? 0),
      filteredEvents: computed(() => {
        const _calEvents = state.calEventsResource.value() ?? [];
        return _calEvents.map((calEvent: CalEventModel) => convertCalEventToFullCalendar(calEvent));
      }),
      isLoading: computed(() => state.calEventsResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
    }
  }),

  withMethods((store) => {
    return {
      setCalendarName(calendarName?: string): void {
        patchState(store, { calendarName });
      },

      reset(): void {
        patchState(store, initialState);
        store.calEventsResource.reload();
      },

      async delete(calEvent: CalEventModel): Promise<void> {
        await store.calEventService.delete(calEvent);
        this.reset();
      }
    }
  })
);

