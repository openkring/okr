import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { addMonths, format } from 'date-fns';
import { doc, WriteBatch } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { from, firstValueFrom, map, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { Attendee, CalendarCollection, CalendarModel, CalEventCollection, CalEventModel, CategoryListModel, InvitationCollection, InvitationModel } from '@okr/shared-models';
import { addDuration, calculateRecurringDates, chipMatches, compareDate, DateFormat, debugListLoaded, extractSecondPartOfOptionalTupel, generateRandomString, getAttendee, getAvatarInfoForCurrentUser, getDayDiff, getSystemQuery, getTodayStr, inviteeCandidates, isAfterDate, isAfterOrEqualDate, nameMatches, pad, removeKeyFromOkrModel, subDuration, warn } from '@okr/shared-util-core';
import { error, navigateByUrl, confirm, okrPrompt, showToast } from '@okr/shared-util-angular';
import { yearMatches } from '@okr/shared-categories';
import { MAX_DATES_PER_SERIES } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { MembershipService } from '@okr/relationship-membership-data-access';
import { LocationService } from '@okr/location-data-access';
import { MatrixChatService } from '@okr/chat-data-access';

import { CalEventService } from '@okr/calevent-data-access';
import { CALEVENT_I18N_KEYS, buildSchedulePollLink, formatSchedulePollInviteMessage, formatScheduleCloseMessage, getCaleventIndex, getSeriesUpdateFields, isCalEvent, isPersonalCalendarName, isPersonalCalevent, planSeriesReconcile, SchedulePollFormData, SchedulePollRow } from '@okr/calevent-util';
import { RegressionSelectionModal } from '@okr/calevent-ui';

const PUBLIC_CALEVENTS_CF_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/getPublicCalEvents';

export type CalEventState = {
  calendarName: string; // all, my, or specific calendar name, tbd: my_pkey (for another user)
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
    locationService: inject(LocationService),
    modelSelectService: inject(ModelSelectService),
    i18nService: inject(I18nService),
    matrixChatService: inject(MatrixChatService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(CALEVENT_I18N_KEYS),

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

    // all locations of the tenant — used by the location typeahead in the edit modal
    locationsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => params.currentUser ? store.locationService.list() : of([]),
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
                calendarKeys.push(cal.okey);
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
      locations: computed(() => state.locationsResource.value() ?? []),
    }
  }),

  withProps((store) => ({
    caleventsResource: rxResource({
      params: () => ({
        calendarName: store.calendarName(),
        calendarsOfCurrentUser: store.calendarsForCurrentUserResource.value() ?? [],
        selectedYear: store.selectedYear(),
        personKey: store.appStore.currentUser()?.personKey ?? '',
        invitedEventKeys: (store.invitationsForCurrentUserResource.value() ?? []).map(inv => inv.caleventKey)
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
        const yearFilterActive = params.selectedYear !== new Date().getFullYear();
        return allEvents$.pipe(
          map(events => {
            const seen = new Set<string>();
            const result: CalEventModel[] = [];
            for (const e of events) {
              // Deduplicate by okey (always)
              if (seen.has(e.okey)) {
                continue;
              }
              // Personal events (no calendar) are visible to their organiser and their invitees only,
              // and never show up in a shared calendar. The 'personal' calendar shows nothing else.
              if (isPersonalCalevent(e)) {
                if (calName !== 'personal' && calName !== 'all' && calName !== 'my') continue;
                const isOrganiser = e.responsiblePersons?.some(p => p.key === params.personKey) === true;
                const isInvitee = params.invitedEventKeys.includes(e.okey);
                if (!params.personKey || (!isOrganiser && !isInvitee)) continue;
              } else if (calName === 'personal') {
                continue;
              } else if (calName === 'my') {
                if (!store.calendarsForCurrentUserResource.value()?.some(key => e.calendars?.includes(key))) {
                  continue;
                }
              } else if (calName !== 'all') { // explicit calendar name
                if (!e.calendars?.includes(calName)) {
                  continue;
                }
              }
              // Filter by showPastEvents/showUpcomingEvents for all calendar types.
              // Skipped when a year other than the current one is selected (99 = all years):
              // otherwise this cutoff would drop every past event before yearMatches() ever
              // runs, making 'Alle Jahre' and any past year silently empty.
              if (!yearFilterActive) {
                if (store.showPastEvents() === false && isAfterDate(store.startDate(), e.startDate)) {
                  continue;
                }
                if (store.showUpcomingEvents() === false && isAfterOrEqualDate(e.startDate, store.startDate())) {
                  continue;
                }
              }
              seen.add(e.okey);
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
          .map((e: CalEventModel) => e.okey),
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
        return state.calendarsResource.value()?.find((cal: CalendarModel) => cal.okey === calName);
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
          // text columns of a schedule poll are dated today only to be storable — never show them
          !calEvent.columnLabel &&
          nameMatches(calEvent.index, state.searchTerm()) &&
          nameMatches(calEvent.type, state.selectedCategory()) &&
          yearMatches(calEvent.startDate, state.selectedYear()) &&
          chipMatches(calEvent.tags, state.selectedTag()))
      )
    };
  }),

  withProps((store) => ({
    // Every invitation of the tenant (not just the current user's) — needed to tell whether a whole
    // group has already been invited. Same underlying query as invitationsForCurrentUserResource,
    // so FirestoreService hands back the cached stream instead of opening a second listener.
    allInvitationsResource: rxResource({
      params: () => ({ personKey: store.appStore.currentUser()?.personKey }),
      stream: ({ params }) => params.personKey
        ? store.appStore.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(store.appStore.env.tenantId), 'inviteeKey', 'asc')
        : of([]),
    }),

    // members of the group owning the currently selected calendar; empty in the 'all'/'my' views
    groupMembersResource: rxResource({
      params: () => ({ groupId: store.groupCalendarId() }),
      stream: ({ params }) => params.groupId
        ? store.membershipService.listMembersOfOrg(params.groupId, 'group')
        : of([]),
    }),
  })),

  withComputed((state) => ({
    groupMembers: computed(() => state.groupMembersResource.value() ?? []),
  })),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      reload() {
        store.caleventsResource.reload();
        store.calendarsResource.reload();
        store.invitationsForCurrentUserResource.reload();
        // No firestoreService.clearCache() here: searchData hands back a LIVE collectionData
        // listener, so a write propagates on its own in the next snapshot — there is nothing
        // stale to evict. Evicting mid-flight only opened a second listener alongside the one
        // the current subscribers still hold.
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
          calendars.find(c => c.okey === calKey)?.owner?.startsWith('group.') === true
        );
      },

      /**
       * Whether offering 'invite the group members' still makes sense: false once every member of the
       * owning group holds an invitation for this event (re-inviting would only produce a toast).
       * Falls back to true when the member list is unknown (e.g. the 'all'/'my' view, where no single
       * group calendar is selected) — inviteGroupMembers then reports the outcome itself.
       */
      canInviteGroup(calevent: CalEventModel): boolean {
        if (!this.isGroupCalevent(calevent)) return false;
        const members = store.groupMembersResource.value() ?? [];
        if (members.length === 0) return true;
        const existing = (store.allInvitationsResource.value() ?? []).filter(inv => inv.caleventKey === calevent.okey && !inv.isArchived);
        return inviteeCandidates(members.map(m => m.memberKey), existing, store.currentUser()?.personKey ?? '').length > 0;
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
      async add(readOnly = true, startDate?: string, startTime?: string, skipReload = false): Promise<CalEventModel | undefined> {
        const cal = store.calendarName();
        const personal = isPersonalCalendarName(cal);
        if (readOnly && !personal) return undefined;
        const newCalevent = new CalEventModel(store.tenantId());
        newCalevent.startDate = startDate ?? getTodayStr();
        newCalevent.startTime = startTime ?? '09:00';
        // the creator is always the initial organiser (plain registered users cannot change it, see calevent.form)
        const user = store.currentUser();
        const avatar = user ? getAvatarInfoForCurrentUser(user) : undefined;
        newCalevent.responsiblePersons = avatar ? [avatar] : [];
        if (personal) {
          // personal event: no calendar, organiser cannot be changed
          newCalevent.calendars = [];
          newCalevent.isOpen = false;
        } else {
          newCalevent.calendars = cal === 'all' || cal.startsWith('my') || cal.length === 0 ? [store.tenantId()] : [cal];
          newCalevent.isOpen = store.calendar()?.defaultIsOpen ?? true;
        }
        const untilDate = addMonths(new Date(), 3);
        newCalevent.repeatUntilDate = format(untilDate, DateFormat.StoreDate);
        return await this.edit(newCalevent, true, false, false, skipReload);
      },

      /** Guard only — CalEventList opens the modal so it can pass its own injector. */
      schedule(): boolean {
        if (!store.isGroupCalendar()) {
          error(store.toastController, CALEVENT_I18N_KEYS.schedule_group_only);
          return false;
        }
        return true;
      },

      /**
       * Best-effort post into the group's Matrix room. The chat client may not be initialised if
       * the user never opened chat this session, so a failure only warns — it must never block a
       * poll from being created or closed.
       */
      async notifyGroupRoom(message: string): Promise<void> {
        const groupId = store.groupCalendarId();
        if (!groupId) return;
        try {
          const functions = getFunctions(getApp(), 'europe-west6');
          const fn = httpsCallable<{ groupId: string }, { roomId: string }>(functions, 'requestGroupRoomAccess');
          const { data } = await fn({ groupId });
          await store.matrixChatService.ensureInitialized();
          await store.matrixChatService.sendMessage(data.roomId, message);
        } catch (err) {
          warn(`CalEventStore.notifyGroupRoom: ${err}`);
          await showToast(store.toastController, store.i18n.schedule_no_room());
        }
      },

      /**
       * Writes the whole poll in one go: one proposed calevent per column plus one invitation per
       * (member × column) — including the author, whose own answers come from the draft table.
       * inviteGroupMembers is deliberately NOT reused: it skips the organiser (who needs a row here)
       * and prompts for an invitation message once per event.
       */
      async createSchedulePoll(data: SchedulePollFormData, origin: string): Promise<void> {
        const currentUser = store.currentUser();
        const groupId = store.groupCalendarId();
        // throw, don't return: the caller dismisses on success, so a silent no-op would look saved
        if (!currentUser || !groupId) throw new Error('CalEventStore.createSchedulePoll: no current user or no group calendar');

        const members = await firstValueFrom(store.membershipService.listMembersOfOrg(groupId, 'group'));
        const seriesId = generateRandomString(18);
        const batch = store.firestoreService.getBatch();
        const myResponses = data.rows[0]?.responses ?? {};
        let eventIndex = 0;

        for (const column of data.columns) {
          const calevent = new CalEventModel(store.tenantId());
          calevent.okey = seriesId + pad(eventIndex, 2);
          calevent.seriesId = seriesId;
          calevent.name = data.name;
          calevent.description = data.description;
          calevent.state = 'proposed';
          calevent.isOpen = false;
          calevent.startDate = column.startDate;
          calevent.startTime = column.startTime;
          calevent.columnLabel = column.columnLabel ?? '';
          calevent.fullDay = column.startTime.length === 0;
          calevent.durationMinutes = calevent.fullDay ? 1440 : 120;
          calevent.calendars = [store.calendarName()];
          calevent.responsiblePersons = [{
            key: currentUser.personKey, name1: currentUser.firstName, name2: currentUser.lastName,
            modelType: 'person', type: '', subType: '', label: '',
          }];
          calevent.index = getCaleventIndex(calevent);
          const eventRef = doc(store.firestoreService.firestore, `${CalEventCollection}/${calevent.okey}`);
          batch.set(eventRef, removeKeyFromOkrModel(structuredClone(calevent)));

          let memberIndex = 0;
          for (const member of members) {
            const inv = new InvitationModel(store.tenantId());
            inv.inviteeKey = member.memberKey;
            inv.inviteeFirstName = member.memberName1;
            inv.inviteeLastName = member.memberName2;
            inv.inviterKey = currentUser.personKey;
            inv.inviterFirstName = currentUser.firstName;
            inv.inviterLastName = currentUser.lastName;
            inv.caleventKey = calevent.okey;
            inv.name = calevent.name;
            inv.date = calevent.startDate;
            inv.state = member.memberKey === currentUser.personKey
              ? (myResponses[column.id] ?? 'pending')
              : 'pending';
            inv.index = `ik:${inv.inviteeKey}, ck:${inv.caleventKey}, n:${inv.inviteeLastName}, d:${inv.date}`;
            const invRef = doc(store.firestoreService.firestore,
              `${InvitationCollection}/${calevent.okey}${pad(memberIndex, 2)}`);
            batch.set(invRef, removeKeyFromOkrModel(structuredClone(inv)));
            memberIndex++;
          }
          eventIndex++;
        }
        await batch.commit();

        const link = buildSchedulePollLink(origin, store.calendarName(), seriesId);
        await this.notifyGroupRoom(formatSchedulePollInviteMessage(data.name, link));
      },

      /** Writes the current user's row in one batch — one update per changed cell. */
      async saveSchedulePollResponses(rows: SchedulePollRow[]): Promise<void> {
        const currentUser = store.currentUser();
        // by personKey, not rows[0]: the current user is only sorted first when they have a row at all
        const myRow = currentUser ? rows.find(row => row.key === currentUser.personKey) : undefined;
        if (!myRow || !currentUser) return;
        const today = getTodayStr(DateFormat.StoreDate);
        const batch = store.firestoreService.getBatch();
        let changed = 0;
        for (const invitation of store.seriesInvitations()) {
          if (invitation.inviteeKey !== currentUser.personKey) continue;
          const newState = myRow.responses[invitation.caleventKey];
          if (!newState || newState === invitation.state) continue;
          const ref = doc(store.firestoreService.firestore, `${InvitationCollection}/${invitation.okey}`);
          batch.update(ref, { state: newState, respondedAt: today });
          changed++;
        }
        if (changed === 0) return;
        await batch.commit();
        await showToast(store.toastController, store.i18n.schedule_response_saved());
      },

      /**
       * The winner becomes a standalone definitive event and keeps its invitations (they are the
       * attendee list). The losing proposals never were real appointments: they are deleted
       * together with their invitations so no orphaned invitation survives.
       */
      async closeSchedule(selectedEvent: CalEventModel, authorMessage?: string): Promise<void> {
        const seriesId = selectedEvent.seriesId;
        const batch = store.firestoreService.getBatch();

        batch.update(doc(store.firestoreService.firestore, `${CalEventCollection}/${selectedEvent.okey}`),
          { state: 'definitive', seriesId: '' });

        // NOT calEvents(): that list is narrowed by calendar/maxEvents/showPastEvents, so a proposal
        // older than ~30 days would survive as an orphan pointing at a series that no longer exists.
        const series = await this.loadSeriesEvents(seriesId);
        const losers = series.filter(
          e => e.okey !== selectedEvent.okey && e.state === 'proposed');
        const loserKeys = losers.map(e => e.okey);
        for (const loser of losers) {
          batch.delete(doc(store.firestoreService.firestore, `${CalEventCollection}/${loser.okey}`));
        }
        const allInvitations = await store.firestoreService.getDataOnce<InvitationModel>(
          InvitationCollection, getSystemQuery(store.tenantId()), 'none');
        // ponytail: one batch, capped at Firestore's 500 writes (a poll of ~10 columns x 30 members
        // is comfortably under that). Chunk into 400-write commits if a poll ever grows past it.
        for (const inv of allInvitations.filter(i => loserKeys.includes(i.caleventKey))) {
          batch.delete(doc(store.firestoreService.firestore, `${InvitationCollection}/${inv.okey}`));
        }
        await batch.commit();

        await this.notifyGroupRoom(
          formatScheduleCloseMessage(selectedEvent.name, selectedEvent.startDate, authorMessage));
      },

      async edit(calevent: CalEventModel, isNew: boolean, readOnly = true, initialDirty = false, skipReload = false): Promise<CalEventModel | undefined> {
        const { CalEventEditModal } = await import('./calevent-edit.modal');
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
            locations: store.locations(),
            readOnly,
            initialDirty
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isCalEvent(data, store.tenantId())) {
            if (data.periodicity === 'once') {
              // `await isNew ? a : b` awaits the boolean, not the write — reload() then raced the save
              await (isNew
                ? store.calEventService.create(data, store.currentUser())
                : store.calEventService.update(data, store.currentUser()));
            } else { // recurring event
              if (isNew) {
                await this.createNewEventSeries(data);
              } else if (!data.seriesId) { // a single event turned into a series
                await this.convertEventToSeries(data);
              } else {  // editing existing series
                const regressionType = await this.askForRegressionType();
                if (!regressionType) return undefined;
                if (regressionType === 'current') {
                  await this.decoupleEventFromSeries(data);
                } else { // future or all
                  await this.updateEventSeries(data, regressionType);
                }
              }
            }
            if (!skipReload) this.reload();
            return data;
          }
        }
        return undefined;
      },

      async view(calevent: CalEventModel): Promise<void> {
        const { CalEventViewModal } = await import('./calevent-view.modal');
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
        } else if (!calevent.seriesId) { // a single event turned into a series
          await this.convertEventToSeries(calevent);
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
            await this.archiveInvitationsOf([calevent.okey]);
          } else { // recurring event
            const regressionType = await this.askForRegressionType('delete');
            if (!regressionType) return;
            if (regressionType === 'current') {
              await store.calEventService.delete(calevent,  store.currentUser());
              await this.archiveInvitationsOf([calevent.okey]);
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
      /**
       * Loads all live occurrences of a series straight from Firestore, sorted by date.
       * Series writes must NOT read from calEvents(): that list is already narrowed by the
       * selected calendar, showPastEvents/showUpcomingEvents and maxEvents, so operating on it
       * silently skips occurrences (by default every past one).
       */
      async loadSeriesEvents(seriesId: string): Promise<CalEventModel[]> {
        if (!seriesId || seriesId.length === 0) return [];
        const query = getSystemQuery(store.tenantId());
        query.push({ key: 'seriesId', operator: '==', value: seriesId });
        const events = await store.firestoreService.getDataOnce<CalEventModel>(CalEventCollection, query, 'none');
        return events.sort((a, b) => compareDate(a.startDate, b.startDate));
      },

      /**
       * Archives every invitation pointing at one of the given events. Invitations are per
       * occurrence (caleventKey), so archiving an occurrence without them leaves them dangling.
       * @param batch an open batch to join, or undefined to commit on its own
       */
      async archiveInvitationsOf(eventKeys: string[], batch?: WriteBatch): Promise<void> {
        if (eventKeys.length === 0) return;
        const all = await store.firestoreService.getDataOnce<InvitationModel>(InvitationCollection, getSystemQuery(store.tenantId()), 'none');
        const orphans = all.filter(inv => eventKeys.includes(inv.caleventKey));
        if (orphans.length === 0) return;
        const target = batch ?? store.firestoreService.getBatch();
        for (const inv of orphans) {
          target.update(doc(store.firestoreService.firestore, `${InvitationCollection}/${inv.okey}`), { isArchived: true });
        }
        if (!batch) await target.commit();
      },

      /**
       * Calculates the dates of a series and reports the two ways it can fail (empty range,
       * too many occurrences) instead of writing a truncated or empty series.
       */
      getSeriesDates(startDate: string, repeatUntilDate: string, periodicity: string): string[] | undefined {
        const dates = calculateRecurringDates(startDate, repeatUntilDate, periodicity);
        if (dates.length === 0) {
          error(store.toastController, `CalEventStore: no dates between ${startDate} and ${repeatUntilDate} for periodicity '${periodicity}'.`);
          return undefined;
        }
        if (dates.length > MAX_DATES_PER_SERIES) {
          error(store.toastController, `CalEventStore: calculated dates (${dates.length}) exceed maximum allowed (${MAX_DATES_PER_SERIES}).`);
          return undefined;
        }
        return dates;
      },

      async createNewEventSeries(calevent: CalEventModel): Promise<void> {
        const dates = this.getSeriesDates(calevent.startDate, calevent.repeatUntilDate, calevent.periodicity);
        if (!dates) return;
        calevent.seriesId = generateRandomString(18); // all members of the series will get this seriesId plus an index as their okey
        let index = 0;
        for (const date of dates) {
          const okey = calevent.seriesId + pad(index, 2);
          const inst = { ...structuredClone(calevent), startDate: date, okey, attendees: [] };
          await store.calEventService.create(inst, store.currentUser());
          index++;
        }
      },

      /**
       * Turns an existing single event into the first occurrence of a new series: the original
       * document keeps its key (and with it its attendees and invitations), the remaining
       * occurrences are created next to it.
       */
      async convertEventToSeries(calevent: CalEventModel): Promise<void> {
        const dates = this.getSeriesDates(calevent.startDate, calevent.repeatUntilDate, calevent.periodicity);
        if (!dates) return;
        calevent.seriesId = generateRandomString(18);
        await store.calEventService.update(calevent, store.currentUser());
        let index = 1;
        for (const date of dates.slice(1)) { // dates[0] is the original event's own date
          const okey = calevent.seriesId + pad(index, 2);
          await store.calEventService.create({ ...structuredClone(calevent), startDate: date, okey, attendees: [] }, store.currentUser());
          index++;
        }
      },

      async decoupleEventFromSeries(calevent: CalEventModel): Promise<void> {
        // make this event a single event, not part of a series anymore
        calevent.seriesId = '';
        calevent.periodicity = 'once';
        await store.calEventService.update(calevent, store.currentUser());
      },

      /**
       * Applies an edit to a series and reconciles its occurrences with the edited recurrence
       * rule: a longer range creates the missing occurrences, a shorter one archives the surplus
       * (together with their invitations), a moved start date shifts the whole affected range.
       * Only the shared fields are propagated — attendees stay with their occurrence.
       */
      async updateEventSeries(calevent: CalEventModel, scope: 'future' | 'all'): Promise<void> {
        const series = await this.loadSeriesEvents(calevent.seriesId);
        if (series.length === 0) return;
        const original = series.find(e => e.okey === calevent.okey);
        // the edited occurrence may have been moved; shift the whole affected range by the same delta
        const dayShift = original ? getDayDiff(original.startDate, calevent.startDate) : 0;
        // 'future' cuts at the occurrence's STORED date — the new one may lie before or after it
        const cutoff = original?.startDate ?? calevent.startDate;
        const affected = scope === 'all' ? series : series.filter(e => isAfterOrEqualDate(e.startDate, cutoff));
        if (affected.length === 0) return;

        const anchor = addDuration(affected[0].startDate, { days: dayShift });
        const dates = this.getSeriesDates(anchor, calevent.repeatUntilDate, calevent.periodicity);
        if (!dates) return;
        const plan = planSeriesReconcile(affected, dates);

        // ponytail: one batch, so a series reconcile is capped at Firestore's 500 writes
        // (~100 occurrences + their invitations). Chunk the commits if that ceiling is ever hit.
        const batch = store.firestoreService.getBatch();
        for (const { event, startDate } of plan.updates) {
          const ref = doc(store.firestoreService.firestore, `${CalEventCollection}/${event.okey}`);
          batch.update(ref, getSeriesUpdateFields(calevent, startDate));
        }
        for (const dropped of plan.archives) {
          const ref = doc(store.firestoreService.firestore, `${CalEventCollection}/${dropped.okey}`);
          batch.update(ref, { isArchived: true });
        }
        await this.archiveInvitationsOf(plan.archives.map(e => e.okey), batch);
        await batch.commit();

        // new occurrences are brand-new documents: no attendees and no invitations are inherited
        const taken = new Set(series.map(e => e.okey));
        let index = series.length;
        for (const date of plan.creates) {
          while (taken.has(calevent.seriesId + pad(index, 2))) index++;
          const okey = calevent.seriesId + pad(index, 2);
          taken.add(okey);
          await store.calEventService.create({ ...structuredClone(calevent), startDate: date, okey, attendees: [], isArchived: false }, store.currentUser());
        }
      },

      async askForRegressionType(mode: 'update' | 'delete' = 'update'): Promise<'current' | 'future' | 'all' | undefined> {
        const i18n = mode === 'delete' ? {
          title: store.i18n.delete_series_label(),
          intro: store.i18n.delete_series_intro(),
          current: store.i18n.delete_series_current(),
          future: store.i18n.delete_series_future(),
          all: store.i18n.delete_series_all()
        } : {
          title: store.i18n.update_series_label(),
          intro: store.i18n.update_series_intro(),
          current: store.i18n.update_series_current(),
          future: store.i18n.update_series_future(),
          all: store.i18n.update_series_all()
        };
        const modal = await store.modalController.create({
          component: RegressionSelectionModal,
          componentProps: { i18n }
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
        const series = await this.loadSeriesEvents(calevent.seriesId);
        if (series.length === 0) return;
        const doomed = scope === 'all' ? series : series.filter(e => isAfterOrEqualDate(e.startDate, calevent.startDate));
        if (doomed.length === 0) return;
        const batch = store.firestoreService.getBatch();
        for (const inst of doomed) {
          const ref = doc(store.firestoreService.firestore, `${CalEventCollection}/${inst.okey}`);
          batch.update(ref, { isArchived: true }); // never spread the model back in — it carries okey, which must not be stored
        }
        await this.archiveInvitationsOf(doomed.map(e => e.okey), batch);
        await batch.commit();
      },

      /******************************* invitations *************************************** */
      /**
       * Asks the organiser for the message that goes out with the invitation(s). The text is stored
       * on every created invitation (`notes`) and is what the invitee reads in the invitations
       * widget. Returns undefined when the organiser cancels — no invitation is then created.
       * An empty text is a valid answer (invitation without a message).
       */
      async promptInvitationMessage(): Promise<string | undefined> {
        const message = await okrPrompt(store.alertController, store.i18n.invite_message_title(),
          store.i18n.invite_message_placeholder(), store.i18n.ok(), store.i18n.cancel());
        return message?.trim();
      },

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
            warn(`CalEventStore.inviteGroupMembers: calevent ${calevent.okey} has no assigned calendars.`); 
            return; 
          }
          if (calendars.length > 1) {
            // tbd: CalEventStore.inviteGroupMembers: handle multiple calendars better, let user decide which one to use (or all ?)
            warn(`CalEventStore.inviteGroupMembers: calevent ${calevent.okey} is assigned to multiple calendars, using the first one.`); 
          }
          const calName = calevent.calendars[0];
          this.setCalendarName(calName);
          console.log(`CalEventStore.inviteGroupMembers: looking for calendar ${calName}.`);
        }
        // check that we are in a group calendar and get the group id from the calendar owner
        const groupId = store.groupCalendarId();
        console.log(`Inviting members of group ${groupId} to calevent ${calevent.okey}`);
        if (groupId.length === 0) {
          warn(`CalEventStore.inviteGroupMembers: calendar ${store.calendarName()} is not a group calendar.`);
          return;
        }
        // get the group members (query memberships by group id)
        const members = await firstValueFrom(store.membershipService.listMembersOfOrg(groupId, 'group'));
        console.log(`Found ${members.length} members in group ${groupId}`, members);

        // Invite everybody except the organiser and everybody who already holds an invitation for
        // this event: re-running the action after a new member joined must not duplicate the
        // invitations of those already invited.
        const allInvitations = await store.firestoreService.getDataOnce<InvitationModel>(InvitationCollection, getSystemQuery(store.tenantId()), 'none');
        const existing = allInvitations.filter(inv => inv.caleventKey === calevent.okey && !inv.isArchived);
        const candidateKeys = inviteeCandidates(members.map(m => m.memberKey), existing, store.currentUser()?.personKey ?? '');
        const candidates = members.filter(m => candidateKeys.includes(m.memberKey));
        if (candidates.length === 0) {
          await showToast(store.toastController, store.i18n.invite_members_none());
          return;
        }

        const message = await this.promptInvitationMessage();
        if (message === undefined) return;   // organiser cancelled

        const batch = store.firestoreService.getBatch();
        const key = generateRandomString(18);
        let index = 0;
        for (const member of candidates) {
          const inv = new InvitationModel(store.tenantId());
          inv.inviteeKey = member.memberKey;
          inv.inviteeFirstName = member.memberName1;
          inv.inviteeLastName = member.memberName2;
          inv.notes = message;
          inv.inviterKey = store.currentUser()?.personKey || '';
          inv.inviterFirstName = store.currentUser()?.firstName || '';
          inv.inviterLastName = store.currentUser()?.lastName || '';
          inv.caleventKey = calevent.okey;
          inv.name = calevent.name;
          inv.date = calevent.startDate;
          inv.index = `ik:${inv.inviteeKey}, ck:${inv.caleventKey}, n:${inv.inviteeLastName}, d:${inv.date}`;
          const inv2 = removeKeyFromOkrModel(structuredClone(inv));
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
          const message = await this.promptInvitationMessage();
          if (message === undefined) return undefined;   // organiser cancelled
          const inv = new InvitationModel(store.tenantId());
          inv.inviteeKey = extractSecondPartOfOptionalTupel(avatar.key);
          inv.inviteeFirstName = avatar.name1;
          inv.inviteeLastName = avatar.name2;
          inv.notes = message;
          inv.inviterKey = store.currentUser()?.personKey || '';
          inv.inviterFirstName = store.currentUser()?.firstName || '';
          inv.inviterLastName = store.currentUser()?.lastName || '';
          inv.caleventKey = calevent.okey;
          inv.name = calevent.name;
          inv.date = calevent.startDate;
          inv.index = `ik:${inv.inviteeKey}, ck:${inv.caleventKey}, n:${inv.inviteeLastName}, d:${inv.date}`;
          return await store.firestoreService.createModel<InvitationModel>(InvitationCollection, inv, store.i18n.invite_person_conf(), store.i18n.invite_person_error(), store.currentUser());
        }
      },

      /******************************* subscriptions *************************************** */
      async subscribe(calEvent: CalEventModel): Promise<void> {
        await this.changeOwnAttendance(calEvent, 'accepted');
      },

      async unsubscribe(calEvent: CalEventModel): Promise<void> {
        await this.changeOwnAttendance(calEvent, 'declined');
      },

      /**
       * Sets the current user's attendance on the given event. Invited users answer their invitation,
       * everybody else (open events, and the organiser of a personal event who never got an
       * invitation) is recorded in the attendees list.
       */
      async changeOwnAttendance(calEvent: CalEventModel, newState: 'accepted' | 'declined'): Promise<void> {
        const inv = calEvent.isOpen ? undefined : store.invitations().find(inv => inv.caleventKey === calEvent.okey);
        if (inv) {
          await this.changeInvitationState(inv, newState);
        } else {
          await this.changeAttendanceState(calEvent, newState);
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
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      },
    }
  })
);
