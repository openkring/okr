import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, map, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { Attendee, CalendarCollection, CalendarModel, CalEventCollection, CalEventModel, CalEventModelName, CategoryListModel, GroupCollection, GroupModel, InvitationCollection, InvitationModel, MandateModel } from '@okr/shared-models';
import { fill, getAttendanceStates, getAttendee, getAvatarInfoForCurrentUser, getInvitationStates, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate, newAvatarInfo } from '@okr/shared-util-core';
import { notify, resourceParams, showToast } from '@okr/shared-util-angular';

import { CalEventService } from '@okr/calendar-calevent-data-access';
import { applyAttendanceFor, CALEVENT_I18N_KEYS, formatDateTimeLabel, grantorAttendOptions, GrantorContext, isAttendanceClosed, mayJoinOpenCalevent, seenKeyFor, toSeenCounts, unseenActivityFor } from '@okr/calendar-calevent-util';
import { SeenService } from '@okr/user-data-access';
import { getVisibleGroupKeys } from '@okr/subject-group-util';

import { InvitationService } from '@okr/relationship-invitation-data-access';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { MandateService, notifyGrantor } from '@okr/relationship-mandate-data-access';
import { MandateStore } from '@okr/relationship-mandate-feature';
import { MANDATE_I18N_KEYS } from '@okr/relationship-mandate-util';
import { TaskService } from '@okr/project-task-data-access';

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
    calEventService: inject(CalEventService),
    invitationService: inject(InvitationService),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    seenService: inject(SeenService),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS),
    // Vollmacht (spec 1.180 §5.2): sign-up for a grantor, same rules as in the calendar list
    mandateStore: inject(MandateStore),
    mandateService: inject(MandateService),
    taskService: inject(TaskService),
    mandateI18n: inject(I18nService).translateAll(MANDATE_I18N_KEYS),
  })),
  withProps((store) => ({
    /** grantors who gave me `calevent.attend` and whose Vollmacht is active today */
    attendGrantorKeys: store.mandateStore.grantorKeysFor('calevent.attend'),
  })),
  withProps((store) => ({
    // returns a list of unigue organization keys for the current user
    // ie. all orgs that the current user is a member of
    membershipsForCurrentUserResource: rxResource({
      params: resourceParams(() => ({
        personKey: store.appStore.currentUser()?.personKey
      })),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([]);
        return store.membershipService.listOrgsOfMember(personKey, 'person');
      }
    }),

    // the user's "seen" markers — with the events' activityCount they make the unseen badge
    seenResource: rxResource({
      params: resourceParams(() => ({ uid: store.appStore.currentUser()?.okey })),
      stream: ({ params }) => store.seenService.list(params.uid),
    }),

    invitationsForCurrentUserResource: rxResource({
      params: resourceParams(() => ({
        personKey: store.appStore.currentUser()?.personKey
      })),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([]);
        return store.appStore.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(store.appStore.env.tenantId), 'inviteeKey', 'asc').pipe(
          map(invitations => invitations.filter(inv => inv.inviteeKey === personKey))
        );
      }
    }),

    /** Per grantor, the orgs they belong to (their group reach). Loads nothing without a `calevent.attend` Vollmacht. */
    grantorMembershipsResource: rxResource({
      params: resourceParams(() => ({ grantorKeys: store.attendGrantorKeys() })),
      stream: ({ params }) => {
        const keys = params.grantorKeys;
        if (keys.length === 0) return of([] as { key: string; orgKeys: string[] }[]);
        return combineLatest(keys.map(key =>
          store.membershipService.listOrgsOfMember(key, 'person').pipe(map(orgKeys => ({ key, orgKeys })))));
      }
    }),

    /** The grantors' invitations: the same cached tenant stream as above, filtered by `inviteeKey`. */
    grantorInvitationsResource: rxResource({
      params: resourceParams(() => ({ grantorKeys: store.attendGrantorKeys() })),
      stream: ({ params }) => {
        const keys = params.grantorKeys;
        if (keys.length === 0) return of([] as InvitationModel[]);
        return store.appStore.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(store.appStore.env.tenantId), 'inviteeKey', 'asc').pipe(
          map(invitations => invitations.filter(inv => keys.includes(inv.inviteeKey)))
        );
      }
    }),

    calendarsResource: rxResource({
      params: resourceParams(() => ({
        currentUser: store.appStore.currentUser()
      })),
      stream: ({params}) => {
        // `calendars` is tenantRead-protected: gate on an authenticated user, or the
        // read fires unauthenticated during the auth-restore window (e.g. a calendar
        // section on the public /welcome landing) → "Missing or insufficient permissions".
        if (!params.currentUser) return of([]);
        return store.appStore.firestoreService.searchData<CalendarModel>(CalendarCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    }),
  })),
  
  // returns okeys of groups visible to the current user via the group's visibility roles (not by membership)
  withProps((store) => ({
    visibleGroupsResource: rxResource({
      params: resourceParams(() => ({
        currentUser: store.appStore.currentUser()
      })),
      stream: ({params}) => {
        const currentUser = params.currentUser;
        if (!currentUser) return of([]);
        return store.appStore.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(store.appStore.env.tenantId), 'name', 'asc').pipe(
          map((groups: GroupModel[]) => {
            const memberKeys = new Set((store.membershipsForCurrentUserResource.value() ?? []).map(k => {
              // orgKeys are stored as 'group.<okey>' — strip the prefix
              const parts = k.split('.');
              return parts.length > 1 ? parts.slice(1).join('.') : k;
            }));
            return getVisibleGroupKeys(groups, memberKeys, currentUser);
          })
        );
      }
    })
  })),

  // returns all calendar keys for the current user: member-based + visibility-based
  withProps((store) => ({
    calendarsForCurrentUserResource: rxResource({
      params: resourceParams(() => ({
        orgKeys: store.membershipsForCurrentUserResource.value() ?? [],
        visibleGroupKeys: store.visibleGroupsResource.value() ?? []
      })),
      stream: ({params}) => {
        const memberOrgKeys: string[] = params.orgKeys;
        const visibleGroupKeys: string[] = params.visibleGroupKeys;
        if (memberOrgKeys.length === 0 && visibleGroupKeys.length === 0) return of([]);
        // Same query as `calendarsResource` above — deliberately ordered by 'name', not 'owner'.
        // The FirestoreService caches query streams by {collection, dbQuery, orderBy, sortOrder},
        // so ordering this one differently opened a SECOND live stream over the identical
        // documents. Ordering by owner is restored client-side below, which costs nothing and
        // halves the calendar streams (spec 1.53 follow-up).
        return store.appStore.firestoreService.searchData<CalendarModel>(CalendarCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
          map((calendars: CalendarModel[]) => [...calendars].sort((a, b) => (a.owner ?? '').localeCompare(b.owner ?? ''))),
          map((calendars: CalendarModel[]) => {
            const calendarKeys: string[] = [];
            for (const cal of calendars) {
              if (memberOrgKeys.includes(cal.owner) || visibleGroupKeys.includes(cal.owner)) {
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
      allCalendars: computed(() => state.calendarsResource.value() ?? []),

      /** Per active `calevent.attend` grantor: first name, the calendars of their orgs, their invitations (spec 1.180 §5.2). */
      grantorContexts: computed((): GrantorContext[] => {
        const calendars = state.calendarsResource.value() ?? [];
        const memberships = state.grantorMembershipsResource.value() ?? [];
        const invitations = state.grantorInvitationsResource.value() ?? [];
        const mandates = state.mandateStore.activeAsGrantee();
        return state.attendGrantorKeys().map(key => {
          const orgKeys = memberships.find(m => m.key === key)?.orgKeys ?? [];
          return {
            key,
            name: mandates.find(m => m.grantorKey === key)?.grantor?.name1 || state.appStore.getPerson(key)?.firstName || '',
            calendarKeys: calendars.filter(cal => orgKeys.includes(cal.owner)).map(cal => cal.okey),
            invitations: invitations.filter(inv => inv.inviteeKey === key),
          };
        });
      }),
    }
  }),

  withProps((store) => ({
      caleventsResource: rxResource({
        params: resourceParams(() => ({
          calendarName: store.calendarName(),
          calendarsOfCurrentUser: store.calendarsForCurrentUserResource.value() ?? [],
          invitedEventKeys: (store.invitationsForCurrentUserResource.value() ?? []).map(inv => inv.caleventKey)
        })),
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
                // Deduplicate by okey (always)
                if (seen.has(e.okey)) {
                  continue;
                }
                // Filter by calendar(s). An invitation is the second source of reach: it is the
                // permission to see exactly that one occurrence, so an invited non-member finds
                // the event under 'my' too (spec 2026-09-06). Same rule as
                // `isCaleventInView` in the calevent store — this section deliberately keeps its
                // own loop because it has no 'personal' view.
                if (calName === 'my') {
                  if (!params.invitedEventKeys.includes(e.okey) &&
                      !params.calendarsOfCurrentUser.some(key => e.calendars?.includes(key))) {
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
                seen.add(e.okey);
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
      isLoading: computed(() => state.caleventsResource.isLoading() || state.calendarsForCurrentUserResource.isLoading() || state.membershipsForCurrentUserResource.isLoading() || state.visibleGroupsResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
      seenCounts: computed(() => toSeenCounts(state.seenResource.value() ?? [])),
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
        store.visibleGroupsResource.reload();
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('calevent_type');
      },

      getPeriodicities(): CategoryListModel {
        return store.appStore.getCategory('periodicity');
      },

      getTags(): string {
        return store.appStore.getTags('calevent');
      },

      getLocale(): string {
        return store.appStore.appConfig().locale;
      },

      /** Comments/documents on the event the user has not looked at yet — the widget badge. */
      unseen(calevent: CalEventModel): number {
        return unseenActivityFor(calevent, store.seenCounts(), store.appStore.currentUser()?.personKey ?? '');
      },

      /** Same contract as CalEventStore.markSeen: opening either modal counts as having looked. */
      markSeen(calevent: CalEventModel): void {
        if (!calevent.okey) return;
        store.seenService.markSeen(store.appStore.currentUser()?.okey, seenKeyFor(calevent.okey), calevent.activityCount ?? 0)
          .catch((ex: unknown) => console.warn(`CalendarStore.markSeen -> ${ex}`));
      },

      async edit(calevent: CalEventModel, isNew = false, readOnly = true, initialDirty = false): Promise<boolean> {
        if (!isNew) this.markSeen(calevent);
        // dynamic import: keeps @okr/calendar-calevent-feature (and FullCalendar) out of the eager graph
        const { CalEventEditModal } = await import('@okr/calendar-calevent-feature');
        const modal = await store.modalController.create({
          component: CalEventEditModal,
          componentProps: {
            calevent,
            currentUser: store.currentUser(),
            types: this.getTypes(),
            periodicities: this.getPeriodicities(),
            tagModel: 'calevent',
            tenantId: store.appStore.tenantId(),
            locale: this.getLocale(),
            readOnly,
            initialDirty
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (!data || readOnly || role !== 'confirm') return false;
        if (isNew) {
          await store.calEventService.create(data, store.currentUser());
        } else {
          await store.calEventService.update(data, store.currentUser());
        }
        this.reload();
        return true;
      },

      async view(calevent: CalEventModel): Promise<void> {
        this.markSeen(calevent);
        // dynamic import: keeps @okr/calendar-calevent-feature (and FullCalendar) out of the eager graph
        const { CalEventViewModal } = await import('@okr/calendar-calevent-feature');
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

      async subscribe(calEvent: CalEventModel): Promise<void> {
        await this.changeOwnAttendance(calEvent, 'accepted');
      },

      async unsubscribe(calEvent: CalEventModel): Promise<void> {
        await this.changeOwnAttendance(calEvent, 'declined');
      },

      /**
       * Anwesenheit des aktuellen Benutzers, eine Quelle: `calevent.attendees` (Spec „Offene
       * Anlaesse", Entscheidung 3). Haelt er eine Einladung, wird sie zusaetzlich beantwortet —
       * sie traegt die Antwortspur und speist das Abzeichen; den Attendee-Eintrag schreibt
       * `InvitationService.respond` dabei selbst.
       */
      async changeOwnAttendance(calEvent: CalEventModel, newState: 'accepted' | 'declined'): Promise<void> {
        if (isAttendanceClosed(calEvent)) return;   // past, locked or cancelled: no An-/Abmeldung
        const inv = store.invitations().find(inv => inv.caleventKey === calEvent.okey);
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
        // sign-up writes only `attendees`; the whole model would resend attendance fields (trainer-only)
        const key = await store.appStore.firestoreService.updateFields(CalEventCollection, calEvent.okey, { attendees: calEvent.attendees }, store.i18n.calevent_update_error());
        if (key) await showToast(store.toastController, store.i18n.calevent_update_conf());
      },

      /** The grantors I may sign up or off for on this event, with their state — the checks run for the grantor. */
      grantorAttendOptions(calEvent: CalEventModel): { key: string; name: string; state: string }[] {
        const contexts = store.grantorContexts();
        if (contexts.length === 0) return [];
        const groupCalendarKeys = store.allCalendars().filter(cal => cal.owner?.startsWith('group.')).map(cal => cal.okey);
        return grantorAttendOptions(calEvent, contexts.map(ctx => ({
          key: ctx.key,
          name: ctx.name,
          hasInvitation: ctx.invitations.some(inv => inv.caleventKey === calEvent.okey),
          mayJoinOpen: mayJoinOpenCalevent(calEvent.calendars, groupCalendarKeys, ctx.calendarKeys),
        })));
      },

      /**
       * Signs a grantor up for, or off from, an event under a family Vollmacht — the same flow as
       * `CalEventStore.changeAttendanceFor`: re-read the Vollmacht from the server (refuse if gone or unreachable),
       * respect the closed event, answer the grantor's invitation if there is one (else write `attendees` only),
       * stamp `actedByKey` = me, then tell the grantor with a task (spec 1.180 §5.2, §5.3).
       */
      async changeAttendanceFor(calEvent: CalEventModel, grantorKey: string, newState: 'accepted' | 'declined'): Promise<void> {
        const currentUser = store.currentUser();
        const actor = currentUser ? getAvatarInfoForCurrentUser(currentUser) : undefined;
        if (!currentUser || !actor?.key) return;
        if (isAttendanceClosed(calEvent)) return;   // past, locked or cancelled: no An-/Abmeldung
        const context = store.grantorContexts().find(ctx => ctx.key === grantorKey);
        const held = store.mandateStore.activeAsGrantee()
          .find(m => m.kind === 'family' && m.grantorKey === grantorKey && m.actions.includes('calevent.attend'));
        if (!context || !held) return;

        let mandate: MandateModel | undefined;
        try {
          mandate = await store.mandateService.readActive(held.okey, store.appStore.tenantId());
        } catch (ex) {
          console.warn('CalendarStore.changeAttendanceFor:', ex);
          await showToast(store.toastController, store.mandateI18n.mandate_check_error());
          return;
        }
        if (!mandate || mandate.granteeKey !== actor.key || !mandate.actions.includes('calevent.attend')) {
          await showToast(store.toastController, fill(store.mandateI18n.mandate_inactive(), { name: context.name }));
          store.mandateStore.reload();
          return;
        }
        const grantor = mandate.grantor ?? newAvatarInfo(grantorKey, context.name, '', 'person', '', '', '');

        const { attendees, waitlisted } = applyAttendanceFor(calEvent.attendees, grantor, newState, actor.key, calEvent.maxAttendees);
        const invitation = context.invitations.find(inv => inv.caleventKey === calEvent.okey);
        if (invitation) {
          if (invitation.isLocked) {
            await notify(store.alertController, store.i18n.invitation_locked_title(), store.i18n.invitation_locked_hint(), store.i18n.ok());
            return;
          }
          if (!await store.invitationService.respond(invitation, newState, currentUser, undefined, actor.key)) return;
        } else {
          const key = await store.appStore.firestoreService.updateFields(CalEventCollection, calEvent.okey, { attendees }, store.i18n.calevent_update_error());
          if (!key) return;
          calEvent.attendees = attendees;
          await showToast(store.toastController, store.i18n.calevent_update_conf());
        }
        if (waitlisted) await showToast(store.toastController, CALEVENT_I18N_KEYS.attendance_waitlist_hint);

        const text = fill(newState === 'accepted' ? store.mandateI18n.notice_attend() : store.mandateI18n.notice_unattend(), {
          actor: actor.name1,
          event: `${calEvent.name}, ${formatDateTimeLabel(calEvent.startDate, calEvent.startTime)}`,
        });
        await notifyGrantor(store.taskService, mandate, actor, grantor, text, { modelType: CalEventModelName, key: calEvent.okey });
      },

      /**
       * Answer an invitation from the calendar section. Routed through InvitationService so the
       * answer is stamped and commented like everywhere else; a locked invitation is refused.
       */
      async changeInvitationState(invitation: InvitationModel, newState: 'pending' | 'accepted' | 'declined'): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        if (invitation.isLocked) {
          await notify(store.alertController, store.i18n.invitation_locked_title(), store.i18n.invitation_locked_hint(), store.i18n.ok());
          return;
        }
        await store.invitationService.respond(invitation, newState, currentUser);
      },
    }
  })
);

