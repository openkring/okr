// libs/aoc/feature/src/lib/aoc-session.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SessionCollection, SessionModel } from '@okr/shared-models';
import { DateFormat, convertDateFormatToString, getTodayStr, subDuration } from '@okr/shared-util-core';
import { exportCsv, getExportFileName, navigateByUrl, showToast } from '@okr/shared-util-angular';
import { getLoggedInUsers, getSessionStatus, SessionStatus } from '@okr/session-util';
import { AOC_I18N_KEYS } from '@okr/aoc-util';
import { UserService } from '@okr/user-data-access';
import { PersonService } from '@okr/subject-person-data-access';

export type StatusFilter = 'all' | SessionStatus;

export type AocSessionState = {
  searchTerm: string;
  selectedStatus: StatusFilter;
  selectedUserKey: string;   // '' = no user filter; set by clicking a logged-in-user chip
  fromDateTime: string;   // StoreDateTime
  toDateTime: string;     // StoreDateTime
  hiddenUserKeys: string[];
  hiddenAnonymous: boolean;   // hide all sessions without a userKey
};

// NOTE: subDuration in shared-util-core has a bug — it uses date-fns `add()` instead of `sub()`.
// Passing { days: -7 } correctly subtracts 7 days via date-fns add() with a negative value.
function lastWeekFrom(): string {
  const now = getTodayStr(DateFormat.StoreDateTime);
  return subDuration(now, { days: -7 }, DateFormat.StoreDateTime);
}

const initialState: AocSessionState = {
  searchTerm: '',
  selectedStatus: 'all',
  selectedUserKey: '',
  fromDateTime: lastWeekFrom(),
  toDateTime: getTodayStr(DateFormat.StoreDateTime),
  hiddenUserKeys: [],
  hiddenAnonymous: false,
};

export const AocSessionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    router: inject(Router),
    userService: inject(UserService),
    personService: inject(PersonService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
    sessionsResource: rxResource({
      params: () => ({
        tenantId: store.appStore.tenantId(),
        from: store.fromDateTime(),
        to: store.toDateTime(),
      }),
      stream: ({ params }): Observable<SessionModel[]> => {
        // No isArchived clause -> matches the existing (tenants CONTAINS, startedAt DESC) index.
        const query = [
          { key: 'tenants', operator: 'array-contains', value: params.tenantId },
          { key: 'startedAt', operator: '>=', value: params.from },
          { key: 'startedAt', operator: '<=', value: params.to },
        ];
        return store.firestoreService.searchData<SessionModel>(SessionCollection, query, 'startedAt', 'desc');
      },
    }),
  })),
  withComputed(state => ({
    isLoading: computed(() => state.sessionsResource.isLoading()),
    allSessions: computed(() => state.sessionsResource.value() ?? []),
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withComputed(state => ({
    filteredSessions: computed(() => {
      const now = Date.now();
      const term = state.searchTerm();
      const status = state.selectedStatus();
      const hidden = new Set(state.hiddenUserKeys());
      const hideAnon = state.hiddenAnonymous();
      const userKey = state.selectedUserKey();
      return state.allSessions().filter(s => {
        if (!s.userKey && hideAnon) return false;
        if (s.userKey && hidden.has(s.userKey)) return false;
        if (userKey && s.userKey !== userKey) return false;
        if (status !== 'all' && getSessionStatus(s, now) !== status) return false;
        if (term) {
          const idx = (s.index || `${s.userEmail} ${s.browser} ${s.os}`).toLowerCase();
          if (!idx.includes(term)) return false;
        }
        return true;
      });
    }),
    activeCount: computed(() => state.allSessions().filter(s => s.isActive).length),
    uniqueUserCount: computed(() => new Set(state.allSessions().filter(s => s.userKey).map(s => s.userKey)).size),
    anonymousCount: computed(() => state.allSessions().filter(s => !s.userKey).length),
    // hidden users are not advertised at the top either
    loggedInUsers: computed(() => {
      const hidden = new Set(state.hiddenUserKeys());
      return getLoggedInUsers(state.allSessions(), Date.now()).filter(u => !hidden.has(u.userKey));
    }),
  })),
  withMethods(store => ({
    /* ---------------- filters ---------------- */
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: (term ?? '').toLowerCase() });
    },
    setStatus(status: string): void {
      patchState(store, { selectedStatus: (status || 'all') as StatusFilter });
    },
    setDuration(from: string, to: string): void {
      patchState(store, { fromDateTime: from, toDateTime: to });
    },
    /** Toggle the list filter for a single user; clicking the selected chip again clears it. */
    toggleUserFilter(userKey: string): void {
      patchState(store, { selectedUserKey: store.selectedUserKey() === userKey ? '' : userKey });
    },
    hideUser(session: SessionModel): void {
      if (!session.userKey) return;
      if (store.hiddenUserKeys().includes(session.userKey)) return;
      patchState(store, {
        hiddenUserKeys: [...store.hiddenUserKeys(), session.userKey],
        // don't leave the list filtered to a user that is no longer shown
        selectedUserKey: store.selectedUserKey() === session.userKey ? '' : store.selectedUserKey(),
      });
    },
    /** Hide every anonymous (no-userKey) session from the list. */
    hideAnonymous(): void {
      patchState(store, { hiddenAnonymous: true });
    },
    clearHidden(): void {
      patchState(store, { hiddenUserKeys: [], hiddenAnonymous: false });
    },
    reload(): void {
      store.sessionsResource.reload();
    },

    /* ---------------- context-menu actions ---------------- */
    async export(type: string): Promise<void> {
      if (type !== 'raw') return;
      const sessions = store.filteredSessions();
      if (sessions.length === 0) {
        showToast(store.toastController, store.i18n.session_export_empty());
        return;
      }
      const fmt = (sdt: string) => sdt ? convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime) : '';
      const header = ['userEmail', 'browser', 'os', 'status', 'startedAt', 'endedAt', 'lastSeenAt', 'durationSeconds', 'userKey', 'okey'];
      const now = Date.now();
      const rows = sessions.map(s => [
        s.userEmail, s.browser, s.os, getSessionStatus(s, now),
        fmt(s.startedAt), fmt(s.endedAt), fmt(s.lastSeenAt),
        String(s.durationSeconds), s.userKey, s.okey,
      ]);
      await exportCsv([header, ...rows], getExportFileName('sessions', 'csv'));
      showToast(store.toastController, store.i18n.session_export_conf());
    },

    async showStatistics(): Promise<void> {
      const { SessionStatisticsModal } = await import('./session-statistics.modal');
      const modal = await store.modalController.create({
        component: SessionStatisticsModal,
        componentProps: { sessions: store.filteredSessions(), title: store.i18n.session_stats_title(), i18n: store.i18n },
      });
      await modal.present();
    },

    async changeDuration(): Promise<void> {
      const { DurationPickerModal } = await import('@okr/shared-ui');
      const modal = await store.modalController.create({
        component: DurationPickerModal,
        cssClass: 'duration-picker-modal',
        componentProps: {
          fromDateTime: store.fromDateTime(),
          toDateTime: store.toDateTime(),
          showDate: true,
          showTime: false,
          i18n: {
            title: store.i18n.session_duration_title(),
            from: store.i18n.session_duration_from(),
            to: store.i18n.session_duration_to(),
            cancel: store.i18n.cancel(),
            save: store.i18n.save(),
          },
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data?.from && data?.to) {
        this.setDuration(data.from, data.to);
      }
    },

    /* ---------------- row actions ---------------- */
    async viewSession(session: SessionModel): Promise<void> {
      const { SessionDetailModal } = await import('./session-detail.modal');
      const modal = await store.modalController.create({
        component: SessionDetailModal,
        componentProps: { session, title: store.i18n.session_detail_title(), i18n: store.i18n },
      });
      await modal.present();
    },

    async editUser(session: SessionModel): Promise<void> {
      if (!session.userKey) return;
      await navigateByUrl(store.router, `/user/${session.userKey}`, { readOnly: false });
    },

    async editPerson(session: SessionModel): Promise<void> {
      if (!session.userKey) return;
      const user = await firstValueFrom(store.userService.read(session.userKey));
      if (!user?.personKey) return;
      const person = store.appStore.getPerson(user.personKey);
      if (!person) return;
      const { PersonEditModal } = await import('@okr/subject-person-feature');
      const modal = await store.modalController.create({
        component: PersonEditModal,
        componentProps: {
          person,
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('person'),
          tenantId: store.appStore.tenantId(),
          genders: store.appStore.getCategory('gender'),
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        await store.personService.update(data, store.appStore.currentUser());
      }
    },
  })),
);
