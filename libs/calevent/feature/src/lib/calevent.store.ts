import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { addMonths, format } from 'date-fns';
import { doc } from 'firebase/firestore';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, ModelSelectService } from '@bk2/shared-feature';
import { CalendarCollection, CalendarModel, CalEventCollection, CalEventModel, CategoryListModel, InvitationCollection, InvitationModel } from '@bk2/shared-models';
import { calculateRecurringDates, chipMatches, DateFormat, debugListLoaded, extractSecondPartOfOptionalTupel, generateRandomString, getSystemQuery, getTodayStr, isAfterOrEqualDate, nameMatches, pad, removeKeyFromBkModel, tenantValidations, warn } from '@bk2/shared-util-core';
import { error, navigateByUrl, confirm } from '@bk2/shared-util-angular';
import { yearMatches } from '@bk2/shared-categories';
import { MAX_DATES_PER_SERIES } from '@bk2/shared-constants';

import { MembershipService } from '@bk2/relationship-membership-data-access';

import { CalEventService } from '@bk2/calevent-data-access';
import { getCaleventIndex, isCalEvent } from '@bk2/calevent-util';
import { RegressionSelectionModalComponent } from '@bk2/calevent-ui';

import { CalEventEditModalComponent } from './calevent-edit.modal';
import { firstValueFrom } from 'rxjs';

export type CalEventState = {
  calendarName: string;
  seriesId: string;

  //filters
  searchTerm: string;
  selectedTag: string;
  selectedCategory: string;
  selectedYear: number;
};

export const initialState: CalEventState = {
  calendarName: '',
  seriesId: '',

  // filters
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
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    router: inject(Router),
    membershipService: inject(MembershipService),
    modelSelectService: inject(ModelSelectService),
  })),
  withProps((store) => ({
    caleventsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<CalEventModel>(CalEventCollection, getSystemQuery(store.appStore.tenantId()), 'startDate', 'asc').pipe(
          debugListLoaded<CalEventModel>('CalEventStore.calevents', params.currentUser)
        );
      }
    }),
    calendarsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<CalendarModel>(CalendarCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
          debugListLoaded<CalendarModel>('CalEventStore.calendars', params.currentUser)
        );
      }
    }),
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
      calendar: computed(() => {
        const calName = state.calendarName();
        if (calName.length === 0 || calName === 'all') return undefined;
        return state.calendarsResource.value()?.find((cal: CalendarModel) => cal.bkey === calName);
      }),
      isLoading: computed(() => state.caleventsResource.isLoading() || state.calendarsResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      calEventsCount: computed(() => state.calEvents().length),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      isGroupCalendar: computed(() => state.calendar()?.owner?.startsWith('group.')),
      groupCalendarId: computed(() => {
        const owner = state.calendar()?.owner;
        if (owner && owner.startsWith('group.')) {
          return owner.substring(6);
        }
        return '';
      }),
      filteredCalEvents: computed(() => 
        state.calEvents()?.filter((calEvent: CalEventModel) => 
          nameMatches(calEvent.index, state.searchTerm()) && 
          nameMatches(calEvent.type, state.selectedCategory()) &&
          yearMatches(calEvent.startDate, state.selectedYear()) &&
          chipMatches(calEvent.tags, state.selectedTag()))
      ),
      seriesEvents: computed(() => {
        if (state.seriesId().length === 0) {
          return [];
        }
        return state.calEvents().filter((calEvent: CalEventModel) => calEvent.seriesId === state.seriesId());
      })
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      reload() {
        store.caleventsResource.reload();
        store.calendarsResource.reload();
        // Clear the Firestore cache to ensure fresh data
        store.firestoreService.clearCache(CalendarCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      },

      /******************************** setters (filter) ******************************************* */
      setCalendarName(calendarName: string) {
        const calendarNames = calendarName.split(',');
        if (calendarNames.length !== 1) {
          warn(`CalEventStore.setCalendarName: exactly one calendar name expected (${calendarNames.join(', ')}).`);
          return;
        }
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

      /******************************* CRUD on single event  *************************************** */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newCalevent = new CalEventModel(store.tenantId());
        newCalevent.startDate = getTodayStr();
        newCalevent.startTime = '09:00';
        newCalevent.calendars = [store.calendarName()];
        const untilDate = addMonths(new Date(), 3);
        newCalevent.repeatUntilDate = format(untilDate, DateFormat.StoreDate);
        await this.edit(newCalevent, true, readOnly);
      },

      async edit(calevent: CalEventModel, isNew: boolean, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: CalEventEditModalComponent,
          componentProps: {
            calevent,
            currentUser: store.currentUser(),
            types: this.getTypes(),
            periodicities: this.getPeriodicities(),
            tags: this.getTags(),
            tenantId: store.tenantId(),
            locale: this.getLocale(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isCalEvent(data, store.tenantId())) {
            if (data.periodicity === 'once') {
              await isNew ? 
                store.calEventService.create(data,  store.currentUser()) : 
                store.calEventService.update(data,  store.currentUser());
            } else { // recurring event
              if (isNew) {
                await this.createNewEventSeries(data);
              } else {  // editing existing series
                const regressionType = await this.askForRegressionType();
                if (!regressionType) return;
                if (regressionType === 'current') {
                  await this.decoupleEventFromSeries(data);
                } else { // future or all
                  await this.updateEventSeries(data, regressionType);
                }
              }
            }
            this.reload();
          }
        }
      },

     async delete(calevent: CalEventModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const result = await confirm(store.alertController, '@calevent.operation.delete.confirm', true);
        if (result === true) {
          if (calevent.periodicity === 'once') {
            await store.calEventService.delete(calevent,  store.currentUser());
          } else { // recurring event
            const regressionType = await this.askForRegressionType();
            if (!regressionType) return;
            if (regressionType === 'current') {
              await store.calEventService.delete(calevent,  store.currentUser());
            } else { // future or all
              await this.deleteEventSeries(calevent, regressionType);
            }
          }
          this.reload();
        }
      },

      async quickEntry(calevent: CalEventModel): Promise<void> {
        await store.calEventService.create(calevent, store.currentUser());
      },

      /******************************* CRUD on calevent series *************************************** */
      async createNewEventSeries(calevent: CalEventModel): Promise<void> {
        calevent.seriesId = generateRandomString(18); // all members of the series will get this seriesId plus an index as their bkey
        let index = 0;
        const dates = calculateRecurringDates(calevent.startDate, calevent.repeatUntilDate, calevent.periodicity);
        if (dates.length > MAX_DATES_PER_SERIES) {
          error(store.toastController, `CalEventStore.createNewEventSeries: calculated dates (${dates.length}) exceed maximum allowed (${MAX_DATES_PER_SERIES}). Aborting series creation.`);
          return;
        }
        for (const date of dates) {
          const bkey = calevent.seriesId + (index).toString().padStart(2, '0');
          const inst = { ...calevent, startDate: date, bkey };
          await store.calEventService.create(inst, store.currentUser());
          index++;
        }
      },

      async decoupleEventFromSeries(calevent: CalEventModel): Promise<void> {
        // make this event a single event, not part of a series anymore
        calevent.seriesId = '';
        calevent.periodicity = 'once';
        await store.calEventService.update(calevent, store.currentUser());
      },

      async updateEventSeries(calevent: CalEventModel, scope: 'future' | 'all'): Promise<void> {
        patchState(store, { seriesId: calevent.seriesId || '' });
        if (store.seriesEvents().length === 0) return;
        const batch = store.firestoreService.getBatch();
        for (const inst of store.seriesEvents()) {
          const shouldUpdate = scope === 'all' || (scope === 'future' && isAfterOrEqualDate(inst.startDate, calevent.startDate));
          if (!shouldUpdate) continue;
          const ref = doc(store.firestoreService.firestore, `${CalEventCollection}/${inst.bkey}`);

          // Update in series
          const storedModel = removeKeyFromBkModel(structuredClone(calevent));
          batch.update(ref, {
            ...storedModel,
            startDate: inst.startDate, // keep original date
            index: getCaleventIndex(storedModel) // regenerate the index
          });
        }
        await batch.commit();
      },

      async askForRegressionType(): Promise<'current' | 'future' | 'all' | undefined> {
        const modal = await store.modalController.create({
          component: RegressionSelectionModalComponent,
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (data === 'current' || data === 'future' || data === 'all') {
            return data;
          }
        }
        return undefined;
      },

      async deleteEventSeries(calevent: CalEventModel, scope: 'future' | 'all'): Promise<void> {
        patchState(store, { seriesId: calevent.seriesId || '' });
        if (store.seriesEvents().length === 0) return;
        const batch = store.firestoreService.getBatch();
        for (const inst of store.seriesEvents()) {
          const shouldUpdate = scope === 'all' || (scope === 'future' && isAfterOrEqualDate(inst.startDate, calevent.startDate));
          if (!shouldUpdate) continue;
          const ref = doc(store.firestoreService.firestore, `${CalEventCollection}/${inst.bkey}`);
          batch.update(ref, { ...inst, isArchived: true });
        }
        await batch.commit();
      },

      /******************************* invitations *************************************** */
      async inviteGroupMembers(calevent: CalEventModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        if (!store.calendar()) {
          console.log(`CalEventStore.inviteGroupMembers: calendar '${store.calendarName()}' not found in calendars list.`);
          const calendars = store.calendarsResource.value() || [];
          console.log('All calendars:', calendars);
          console.log('Calendar names:', calendars.map(c => c.name));
          console.log('Looking for calendarName:', store.calendarName());
          console.log('Calevent calendars array:', calevent.calendars);

          if (calevent.calendars.length === 0) {
            warn(`CalEventStore.inviteGroupMembers: calevent ${calevent.bkey} has no assigned calendars.`); 
            return; 
          }
          if (calendars.length > 1) {
            // tbd: CalEventStore.inviteGroupMembers: handle multiple calendars better, let user decide which one to use (or all ?)
            warn(`CalEventStore.inviteGroupMembers: calevent ${calevent.bkey} is assigned to multiple calendars, using the first one.`); 
          }
          const calName = calevent.calendars[0];
          this.setCalendarName(calName);
          console.log(`CalEventStore.inviteGroupMembers: looking for calendar ${calName}.`);
        }
        // check that we are in a group calendar and get the group id from the calendar owner
        const groupId = store.groupCalendarId();
        console.log(`Inviting members of group ${groupId} to calevent ${calevent.bkey}`);
        if (groupId.length === 0) {
          warn(`CalEventStore.inviteGroupMembers: calendar ${store.calendarName()} is not a group calendar.`);
          return;
        }
        // get the group members (query memberships by group id)
        const members = await firstValueFrom(store.membershipService.listMembersOfOrg(groupId));
        console.log(`Found ${members.length} members in group ${groupId}`, members);
        // create invitations for all group members
        const batch = store.firestoreService.getBatch();
        const key = generateRandomString(18);
        let index = 0;
        for (const member of members) {
          const inv = new InvitationModel(store.tenantId());
          inv.inviteeKey = member.memberKey;
          inv.inviteeFirstName = member.memberName1;
          inv.inviteeLastName = member.memberName2;
          inv.inviterKey = store.currentUser()?.personKey || '';
          inv.inviterFirstName = store.currentUser()?.firstName || '';
          inv.inviterLastName = store.currentUser()?.lastName || '';
          inv.caleventKey = calevent.bkey;
          inv.name = calevent.name;
          inv.date = calevent.startDate;
          inv.index = `ik:${inv.inviteeKey}, ck:${inv.caleventKey}, n:${inv.inviteeLastName}, d:${inv.date}`;
          const inv2 = removeKeyFromBkModel(structuredClone(inv));
          console.log(`Creating invitation on ${InvitationCollection}/${key}${pad(index, 2)}`, inv2);
          const ref = doc(store.firestoreService.firestore, `${InvitationCollection}/${key + pad(index, 2)}`);
          batch.set(ref, inv2);
          index++;
        }
        await batch.commit();
      },

      async invitePerson(calevent: CalEventModel, readOnly = true): Promise<string | undefined> {
        const avatar = await store.modelSelectService.selectPersonAvatar('', '');
        if (avatar && !readOnly) {
          const inv = new InvitationModel(store.tenantId());
          inv.inviteeKey = extractSecondPartOfOptionalTupel(avatar.key);
          inv.inviteeFirstName = avatar.name1;
          inv.inviteeLastName = avatar.name2;
          inv.inviterKey = store.currentUser()?.personKey || '';
          inv.inviterFirstName = store.currentUser()?.firstName || '';
          inv.inviterLastName = store.currentUser()?.lastName || '';
          inv.caleventKey = calevent.bkey;
          inv.name = calevent.name;
          inv.date = calevent.startDate;
          inv.index = `ik:${inv.inviteeKey}, ck:${inv.caleventKey}, n:${inv.inviteeLastName}, d:${inv.date}`;
          return await store.firestoreService.createModel<InvitationModel>(InvitationCollection, inv, '@invitation.operation.create', store.currentUser());
        }
      },

      /******************************* other *************************************** */
      async export(type: string): Promise<void> {
        console.log(`CalEventStore.export(${type}) is not yet implemented.`);
      },

      async showAlbum(albumUrl: string): Promise<void> {
        if (albumUrl.length > 0) {
          await navigateByUrl(store.router, albumUrl)
        } 
      }
    }
  })
);
