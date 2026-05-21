import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { addMonths, format } from 'date-fns';
import { doc } from 'firebase/firestore';
import { from, firstValueFrom, map, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, ModelSelectService } from '@bk2/shared-feature';
import { Attendee, CalendarCollection, CalendarModel, CalEventCollection, CalEventModel, CategoryListModel, InvitationCollection, InvitationModel } from '@bk2/shared-models';
import { addDuration, calculateRecurringDates, chipMatches, DateFormat, debugListLoaded, extractSecondPartOfOptionalTupel, generateRandomString, getAttendee, getAvatarInfoForCurrentUser, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate, nameMatches, pad, removeKeyFromBkModel, subDuration, warn } from '@bk2/shared-util-core';
import { error, navigateByUrl, confirm } from '@bk2/shared-util-angular';
import { yearMatches } from '@bk2/shared-categories';
import { MAX_DATES_PER_SERIES } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { MembershipService } from '@bk2/relationship-membership-data-access';

import { CalEventService } from '@bk2/calevent-data-access';
import { getCaleventIndex, isCalEvent } from '@bk2/calevent-util';
import { RegressionSelectionModal } from '@bk2/calevent-ui';

import { CalEventEditModal } from './calevent-edit.modal';
import { CalEventViewModal } from './calevent-view.modal';
import { PFX } from './scope';

const PUBLIC_CALEVENTS_CF_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/getPublicCalEvents';

export type CalEventState = {
  calendarName: string; // all, my, or specific calendar name, tbd: my_pkey (for another user)
  seriesId: string;
  scheduleSeriesId: string;
  maxEvents: number | undefined; // max events to show, undefined means all
  showPastEvents: boolean; // whether to show past events
  showUpcomingEvents: boolean; // whether to show upcoming events
  // an offset to calculate the start date
  // example: -30 = always starting one month in the history
  // example: 0 = today
  startDaysOffset: number;

  //filters
  searchTerm: string;
  selectedTag: string;
  selectedCategory: string;
  selectedYear: number;
};

export const initialState: CalEventState = {
  calendarName: '',
  seriesId: '',
  scheduleSeriesId: '',
  maxEvents: undefined,
  showPastEvents: false,
  showUpcomingEvents: true,
  startDaysOffset: -30,

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
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      calevents:            PFX + 'calevents',
      empty:                PFX + 'empty',
      description:          '@description',
      duration:             PFX + 'duration',
      event:                '@event',
      year:                 '@year',
      responsible:          PFX + 'responsible',
      location:             '@location',
      topic:                '@topic',
      date:                 '@date',
      url:                  '@url',

      attendees_accepted:   PFX + 'attendance.accepted',
      attendees_plural:     PFX + 'attendance.plural',
      attendees_exists:     PFX + 'attendance.exists',
      attendees_empty:      PFX + 'attendance.empty',

      update_conf:                PFX + 'update.conf',
      update_error:               PFX + 'update.error',
      delete_confirm:             PFX + 'delete.confirm',
      download_ics:               PFX + 'download.ics',

      quick_entry_label:          PFX + 'quickEntry.label',
      quick_entry_placeholder:    PFX + 'quickEntry.placeholder',

      schedule_title:             PFX + 'schedule.title',
      schedule_find:              PFX + 'schedule.find',
      schedule_close_label:       PFX + 'schedule.close.label',
      schedule_close_message:     PFX + 'schedule.close.message',
      schedule_optional_message:  PFX + 'schedule.optionalMessage',
      schedule_date_proposals:    PFX + 'schedule.date.proposals',
      schedule_date_add:          PFX + 'schedule.date.add',
      schedule_confirm:           PFX + 'schedule.date.confirm',
      schedule_member_invite:     PFX + 'invite.members',
      schedule_member_pending:    PFX + 'invitation.pending',
      schedule_view:              PFX + 'schedule.view',

      invite_conf:                PFX + 'invite.conf',
      invite_error:               PFX + 'invite.error',
      invite_group:               PFX + 'invite.group',
      invite_person:              PFX + 'invite.person',
      invite_members:             PFX + 'invite.members',

      invitation_update_conf:     PFX + 'invitation.update.conf',
      invitation_update_error:    PFX + 'invite.update.error',
 
      wd_monday:            PFX + 'weekDayAbbreviation.monday',
      wd_tuesday:           PFX + 'weekDayAbbreviation.tuesday',
      wd_wednesday:         PFX + 'weekDayAbbreviation.wednesday',
      wd_thursday:          PFX + 'weekDayAbbreviation.thursday',
      wd_friday:            PFX + 'weekDayAbbreviation.friday',
      wd_saturday:          PFX + 'weekDayAbbreviation.saturday',
      wd_sunday:            PFX + 'weekDayAbbreviation.sunday',

      periodicity_label:          PFX + 'periodicity.label',
      periodicity_once:           PFX + 'periodicity.once',
      periodicity_daily:          PFX + 'periodicity.daily',
      periodicity_workday:        PFX + 'periodicity.workday',
      periodicity_weekly:         PFX + 'periodicity.weekly',
      periodicity_biweekly:       PFX + 'periodicity.biweekly',
      periodicity_monthly:        PFX + 'periodicity.monthly',
      periodicity_quarterly:      PFX + 'periodicity.quarterly',
      periodicity_yearly:         PFX + 'periodicity.yearly',

      as_title:             '@actionsheet.title',
      as_view:              PFX + 'actionsheet.view',
      as_edit:              PFX + 'actionsheet.edit',
      as_create:            PFX + 'actionsheet.create',
      as_delete:            PFX + 'actionsheet.delete',
      as_subscribe:         PFX + 'invitation.subscribe',
      as_unsubscribe:       PFX + 'invitation.unsubscribe',
      as_albums:            PFX + 'actionsheet.albums',
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
      ok: '@ok',
      cancel: '@cancel'
    }),

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
    }),
  })),

  withComputed((state) => {
    return {
      startDate: computed(() => {
        if (state.startDaysOffset() < 0) {
          return subDuration(getTodayStr(), { days: state.startDaysOffset()});
        }
        if (state.startDaysOffset() > 0) {
          return addDuration(getTodayStr(), { days: state.startDaysOffset() })
        }
        return getTodayStr();
      })
    }
  }),
  
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

  withComputed((state) => {
    return {
      calendarsOfCurrentUser: computed(() => state.calendarsForCurrentUserResource.value() ?? []),
    }
  }),

  withProps((store) => ({
    caleventsResource: rxResource({
      params: () => ({
        calendarName: store.calendarName(),
        calendarsOfCurrentUser: store.calendarsForCurrentUserResource.value() ?? []
      }),
      stream: ({ params }) => {
        const calName = params.calendarName;
        if (!calName || calName.length === 0) return of([]);
        if (!store.appStore.fbUser()) {
          if (calName !== 'public') return of([]);
          const url = `${PUBLIC_CALEVENTS_CF_URL}?tenantId=${encodeURIComponent(store.appStore.tenantId())}`;
          return from(fetch(url).then(r => r.ok ? r.json() as Promise<CalEventModel[]> : []));
        }
        const allEvents$ = store.appStore.firestoreService.searchData<CalEventModel>(CalEventCollection, getSystemQuery(store.appStore.env.tenantId), 'startDate', 'asc');
        const maxEvents = store.maxEvents();
        return allEvents$.pipe(
          map(events => {
            const seen = new Set<string>();
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
              if (store.showPastEvents() === false && isAfterDate(store.startDate(), e.startDate)) {
                continue;
              }
              if (store.showUpcomingEvents() === false && isAfterOrEqualDate(e.startDate, store.startDate())) {
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
    }),
    calendarsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        if (!params.currentUser) return of([]);
        return store.firestoreService.searchData<CalendarModel>(CalendarCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
          debugListLoaded<CalendarModel>('CalEventStore.calendars', params.currentUser)
        );
      }
    }),
  })),

  withProps((store) => ({
    seriesInvitationsResource: rxResource({
      params: () => ({
        seriesId: store.scheduleSeriesId(),
        proposedEventKeys: (store.caleventsResource.value() ?? [])
          .filter((e: CalEventModel) => e.seriesId === store.scheduleSeriesId() && e.state === 'proposed')
          .map((e: CalEventModel) => e.bkey),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.seriesId || params.proposedEventKeys.length === 0) return of([]);
        return store.appStore.firestoreService
          .searchData<InvitationModel>(InvitationCollection, getSystemQuery(params.tenantId), 'inviteeKey', 'asc')
          .pipe(map((invs: InvitationModel[]) => invs.filter(inv => params.proposedEventKeys.includes(inv.caleventKey))));
      },
    }),
  })),

  withComputed((state) => {
    return {
      calEvents: computed(() => state.caleventsResource.value() ?? []),
      invitations: computed(() => state.invitationsForCurrentUserResource.value() ?? []),
      seriesInvitations: computed(() => state.seriesInvitationsResource.value() ?? []),

      calendar: computed(() => {
        const calName = state.calendarName();
        if (calName.length === 0 || calName === 'all' || calName === 'my') return undefined;
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
      isGroupCalendar: computed(() => state.calendar()?.owner?.startsWith('group.') ?? false),
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
        store.invitationsForCurrentUserResource.reload();
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

      setStartDaysOffset(startDaysOffset: number) {
        patchState(store, { startDaysOffset });
      },

      setScheduleSeriesId(seriesId: string): void {
        patchState(store, { scheduleSeriesId: seriesId });
      },

      /******************************** getters ******************************************* */

      /** Returns true if any of the calEvent's calendars is owned by a group. */
      isGroupCalevent(calEvent: CalEventModel): boolean {
        const calendars = store.calendarsResource.value() ?? [];
        return (calEvent.calendars ?? []).some(calKey =>
          calendars.find(c => c.bkey === calKey)?.owner?.startsWith('group.') === true
        );
      },

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
      async add(readOnly = true, startDate?: string, startTime?: string, skipReload = false): Promise<void> {
        if (readOnly) return;
        const newCalevent = new CalEventModel(store.tenantId());
        newCalevent.startDate = startDate ?? getTodayStr();
        newCalevent.startTime = startTime ?? '09:00';
        const cal = store.calendarName();
        newCalevent.calendars = cal === 'all' || cal.startsWith('my') || cal.length === 0 ? [store.tenantId()] : [cal];
        newCalevent.isOpen = store.calendar()?.defaultIsOpen ?? true;
        const untilDate = addMonths(new Date(), 3);
        newCalevent.repeatUntilDate = format(untilDate, DateFormat.StoreDate);
        await this.edit(newCalevent, true, readOnly, false, skipReload);
      },

      async schedule(): Promise<void> {
        if (!store.isGroupCalendar()) return;
        const { ScheduleNewModal } = await import('./schedule-new.modal');
        const modal = await store.modalController.create({
          component: ScheduleNewModal,
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ name: string; description: string; dates: string[] }>();
        if (role !== 'confirm' || !data) return;

        const seriesId = generateRandomString(18);
        let index = 0;
        for (const isoDate of data.dates) {
          const startDate = isoDate.replace(/-/g, '').substring(0, 8);
          const calevent = new CalEventModel(store.tenantId());
          calevent.bkey = seriesId + index.toString().padStart(2, '0');
          calevent.seriesId = seriesId;
          calevent.name = data.name;
          calevent.description = data.description;
          calevent.state = 'proposed';
          calevent.isOpen = false;
          calevent.startDate = startDate;
          calevent.fullDay = true;
          calevent.durationMinutes = 1440;
          calevent.calendars = [store.calendarName()];
          const user = store.currentUser();
          calevent.responsiblePersons = user
            ? [{ key: user.personKey, name1: user.firstName, name2: user.lastName, modelType: 'person', type: '', subType: '', label: '' }]
            : [];
          calevent.index = getCaleventIndex(calevent);
          await store.calEventService.create(calevent, store.currentUser());
          await this.inviteGroupMembers(calevent, false);
          index++;
        }
      },

      async closeSchedule(selectedEvent: CalEventModel): Promise<void> {
        const seriesId = selectedEvent.seriesId;
        const batch = store.firestoreService.getBatch();

        const selectedRef = doc(store.firestoreService.firestore, `calevents/${selectedEvent.bkey}`);
        batch.update(selectedRef, { state: 'definitive', seriesId: '' });

        const others = store.calEvents().filter(
          e => e.seriesId === seriesId && e.bkey !== selectedEvent.bkey && e.state === 'proposed'
        );
        for (const other of others) {
          const ref = doc(store.firestoreService.firestore, `calevents/${other.bkey}`);
          batch.update(ref, { isArchived: true });
        }

        await batch.commit();
      },

      async edit(calevent: CalEventModel, isNew: boolean, readOnly = true, initialDirty = false, skipReload = false): Promise<boolean> {
        const modal = await store.modalController.create({
          component: CalEventEditModal,
          componentProps: {
            calevent,
            currentUser: store.currentUser(),
            types: this.getTypes(),
            periodicities: this.getPeriodicities(),
            tags: this.getTags(),
            tenantId: store.tenantId(),
            locale: this.getLocale(),
            readOnly,
            initialDirty
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
                if (!regressionType) return false;
                if (regressionType === 'current') {
                  await this.decoupleEventFromSeries(data);
                } else { // future or all
                  await this.updateEventSeries(data, regressionType);
                }
              }
            }
            if (!skipReload) this.reload();
            return true;
          }
        }
        return false;
      },

      async view(calevent: CalEventModel): Promise<void> {
        const modal = await store.modalController.create({
          component: CalEventViewModal,
          componentProps: {
            calevent,
            periodicities: this.getPeriodicities(),
            locale: this.getLocale()
          }
        });
        modal.present();
      },

      async update(calevent: CalEventModel, readOnly = true): Promise<boolean> {
        if (readOnly === true) return false;
        if (calevent.periodicity === 'once') {
          await store.calEventService.update(calevent, store.currentUser());
        } else {  // series
          const regressionType = await this.askForRegressionType();
          if (!regressionType) return false;
          if (regressionType === 'current') {
            await this.decoupleEventFromSeries(calevent);
          } else { // future or all
            await this.updateEventSeries(calevent, regressionType);
          }
        }
        return true;
      },

     async delete(calevent: CalEventModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
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
          component: RegressionSelectionModal,
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
          return await store.firestoreService.createModel<InvitationModel>(InvitationCollection, inv, store.i18n.invite_conf(), store.i18n.invite_error(), store.currentUser());
        }
      },

      /******************************* subscriptions *************************************** */
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
        await store.appStore.firestoreService.updateModel<CalEventModel>(CalEventCollection, calEvent, false, store.i18n.update_conf(), store.i18n.update_error(), currentUser);
      },

      async changeInvitationState(invitation: InvitationModel, newState: 'pending' | 'accepted' | 'declined' | 'maybe'): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        invitation.state = newState;
        invitation.respondedAt = getTodayStr(DateFormat.StoreDate);
        await store.appStore.firestoreService.updateModel<InvitationModel>(InvitationCollection, invitation, false, store.i18n.invitation_update_conf(), store.i18n.invitation_update_error(), currentUser);
        // this.reload();
      },

      /******************************* other *************************************** */
      async export(type: string): Promise<void> {
        console.log(`CalEventStore.export(${type}) is not yet implemented.`);
      },

      async showAlbum(albumUrl: string): Promise<void> {
        if (albumUrl.length > 0) {
          await navigateByUrl(store.router, albumUrl)
        } 
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.as_view();
        }
        if (key && key.length > 0) {
          return store.i18n.as_edit();
        } else {
          return store.i18n.as_create();
        }
      },
    }
  })
);
