import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { CalendarCollection, CalendarModel, CalEventCollection, CalEventModel } from '@bk2/shared-models';
import { getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate } from '@bk2/shared-util-core';

import { MembershipService } from '@bk2/relationship-membership-data-access';

export type CalendarState = {
  calendarName: string | undefined; // all, my, or specific calendar name
  maxEvents: number | undefined; // max events to show, undefined means all
  showPastEvents: boolean; // whether to show past events
  showUpcomingEvents: boolean; // whether to show upcoming events
};

export const initialState: CalendarState = {
  calendarName: '',
  maxEvents: undefined,
  showPastEvents: false,
  showUpcomingEvents: true,
};

export const CalendarStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    modalController: inject(ModalController),  
  })),
  withProps((store) => ({
    // returns a list of unigue organization keys for the current user
    // ie. all orgs that the current user is a member of
    membershipsForCurrentUserResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey
      }),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([]);
        return store.membershipService.listOrgsOfMember(personKey, 'person');
      }
    }),
  })),
  
  // returns all calendars that belong to orgs of the current user
  withProps((store) => ({
    calendarsForCurrentUserResource: rxResource({
      params: () => ({
        orgKeys: store.membershipsForCurrentUserResource.value() ?? []
      }),
      stream: ({params}) => {
        const orgKeys: string[] = params.orgKeys;
        if (!orgKeys || orgKeys.length === 0) return of([]);
        // Get all calendars and filter by owner
        return store.appStore.firestoreService.searchData<CalendarModel>(CalendarCollection, getSystemQuery(store.appStore.env.tenantId), 'owner', 'asc').pipe(
          map((calendars: CalendarModel[]) => {
            // Find calendar keys where owner matches any orgKey
            const calendarKeys: string[] = [];
            for (const cal of calendars) {
              if (orgKeys.includes(cal.owner)) {
                calendarKeys.push(cal.bkey);
              }
            }
            return calendarKeys;
          })
        );
      }
    })
  })),

  withProps((store) => ({
      calEventsResource: rxResource({
      params: () => ({
        calendarName: store.calendarName(),
        calendarsOfCurrentUser: store.calendarsForCurrentUserResource.value() ?? []
      }),
      stream: ({params}) => {
        const calName = params.calendarName;
        if ((!calName || calName.length === 0)) {
          return of([]);
        } else {
          const allEvents$ = store.appStore.firestoreService.searchData<CalEventModel>(CalEventCollection, getSystemQuery(store.appStore.env.tenantId), 'startDate', 'asc');
          if (calName === 'all') {
            return allEvents$;            
          }
          const maxEvents = store.maxEvents();
          return allEvents$.pipe(
            map(events => {
              const seen = new Set<string>();
              const today = getTodayStr();
              const result: CalEventModel[] = [];
              for (const e of events) {
                // Deduplicate by bkey
                if (seen.has(e.bkey)) {
                  continue;
                }
                // Filter by calendar(s)
                if (calName === 'my') {
                  if (!store.calendarsForCurrentUserResource.value()?.some(key => e.calendars?.includes(key))) {
                    continue;
                  }
                } else {    // explicit calendar name
                  if (!e.calendars?.includes(calName)) {
                    continue;
                  }
                }
                // Filter by showPastEvents/showUpcomingEvents
                if (store.showPastEvents() === false && isAfterDate(today, e.startDate)) {
                  continue;
                }
                if (store.showUpcomingEvents() === false && isAfterOrEqualDate(e.startDate, today)) {
                  continue;
                }
                seen.add(e.bkey);
                result.push(e);
                if (maxEvents && result.length >= maxEvents) break;
              }
              return result;
            })
          )
        }
      }
    })
  })),

  withComputed((state) => {
    return {
      calevents: computed(() => {
        const events = state.calEventsResource.value() ?? [];
        const showPast = state.showPastEvents();
        const showUpcoming = state.showUpcomingEvents();
        const today = getTodayStr();
        return events.filter(e =>
          (showPast && isAfterDate(today, e.startDate)) ||
          (showUpcoming && isAfterOrEqualDate(e.startDate, today))
        );
      }),
      isLoading: computed(() => state.calEventsResource.isLoading() || state.calendarsForCurrentUserResource.isLoading() || state.membershipsForCurrentUserResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
    }
  }),

  withMethods((store) => {
    return {
      setCalendarName(calendarName?: string): void {
        patchState(store, { calendarName });
      },

      setConfig(calendarName?: string, maxEvents?: number, showPastEvents?: boolean, showUpcomingEvents?: boolean): void {
        patchState(store, { calendarName, maxEvents, showPastEvents, showUpcomingEvents });
      },

      reload(): void {
        store.calEventsResource.reload();
        store.calendarsForCurrentUserResource.reload();
        store.membershipsForCurrentUserResource.reload();
      },

      async subscribe(calEvent: CalEventModel): Promise<void> {
        console.log(`CalendarStore.subscribe(): subscribing to event ${calEvent.bkey}`);
      },

      async unsubscribe(calEvent: CalEventModel): Promise<void> {
        console.log(`CalendarStore.unsubscribe(): unsubscribing from event ${calEvent.bkey}`);
      },
    }
  })
);

