import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { Attendee, CalendarCollection, CalendarModel, CalEventCollection, CalEventModel, InvitationCollection, InvitationModel } from '@bk2/shared-models';
import { DateFormat, getAttendanceStates, getAttendee, getAvatarInfo, getAvatarInfoForCurrentUser, getInvitationStates, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate } from '@bk2/shared-util-core';

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

    invitationsForCurrentUserResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey
      }),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([]);
        return store.appStore.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(store.appStore.env.tenantId), 'inviteeKey', 'asc').pipe(
          map(invitations => invitations.filter(inv => inv.inviteeKey === personKey))
        );
      }
    })
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
      caleventsResource: rxResource({
        params: () => ({
          calendarName: store.calendarName(),
          calendarsOfCurrentUser: store.calendarsForCurrentUserResource.value() ?? []
        }),
        stream: ({ params }) => {
          const calName = params.calendarName;
          if (!calName || calName.length === 0) {
            return of([]);
          }
          const allEvents$ = store.appStore.firestoreService.searchData<CalEventModel>(CalEventCollection, getSystemQuery(store.appStore.env.tenantId), 'startDate', 'asc');
          const maxEvents = store.maxEvents();
          return allEvents$.pipe(
            map(events => {
              const seen = new Set<string>();
              const today = getTodayStr();
              const result: CalEventModel[] = [];
              for (const e of events) {
                // Deduplicate by bkey (always)
                if (seen.has(e.bkey)) {
                  continue;
                }
                // Filter by calendar(s)
                if (calName === 'my') {
                  if (!store.calendarsForCurrentUserResource.value()?.some(key => e.calendars?.includes(key))) {
                    continue;
                  }
                } else if (calName !== 'all') { // explicit calendar name
                  if (!e.calendars?.includes(calName)) {
                    continue;
                  }
                }
                // Filter by showPastEvents/showUpcomingEvents for all calendar types
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
          );
        }
      })
  })),

  withComputed((state) => {
    return {
      calevents: computed(() => state.caleventsResource.value() ?? []),
      invitations: computed(() => state.invitationsForCurrentUserResource.value() ?? []),
      states: computed(() => getAttendanceStates(state.caleventsResource.value() ?? [], state.appStore.currentUser()?.personKey ?? '')),
      invitationStates: computed(() => getInvitationStates(state.caleventsResource.value() ?? [], state.invitationsForCurrentUserResource.value() ?? [])),
      isLoading: computed(() => state.caleventsResource.isLoading() || state.calendarsForCurrentUserResource.isLoading() || state.membershipsForCurrentUserResource.isLoading()),
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
        store.caleventsResource.reload();
        store.calendarsForCurrentUserResource.reload();
        store.membershipsForCurrentUserResource.reload();
      },

      async subscribe(calEvent: CalEventModel): Promise<void> {
        if (calEvent.isOpen) {
          await this.changeAttendanceState(calEvent, 'accepted');
        } else {
          const inv = store.invitations().find(inv => inv.caleventKey === calEvent.bkey);
          if (inv) {
            await this.changeInvitationState(inv, 'accepted');
          }
        }
      },

      async unsubscribe(calEvent: CalEventModel): Promise<void> {
        if (calEvent.isOpen) {
          await this.changeAttendanceState(calEvent, 'declined');
        } else {
          const inv = store.invitations().find(inv => inv.caleventKey === calEvent.bkey);
          if (inv) {
            await this.changeInvitationState(inv, 'declined');
          }
        }
      },

      async changeAttendanceState(calEvent: CalEventModel, newState: 'accepted' | 'declined' | 'invited'): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        const attendee = getAttendee(calEvent, currentUser.personKey ?? '');
        if (attendee) {
          attendee.state = newState;
        } else {
          const avatar = getAvatarInfoForCurrentUser(currentUser);
          if (!avatar) return;
          const newAttendee: Attendee = {
            person: avatar,
            state: newState
          };
          calEvent.attendees.push(newAttendee);
        }
        await store.appStore.firestoreService.updateModel<CalEventModel>(CalEventCollection, calEvent, false, '@calevent.operation.update', currentUser);
      },

      async changeInvitationState(invitation: InvitationModel, newState: 'pending' | 'accepted' | 'declined' | 'maybe'): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        invitation.state = newState;
        invitation.respondedAt = getTodayStr(DateFormat.StoreDate);
        await store.appStore.firestoreService.updateModel<InvitationModel>(InvitationCollection, invitation, false, '@invitation.operation.update', currentUser);
        // this.reload();
      },
    }
  })
);

