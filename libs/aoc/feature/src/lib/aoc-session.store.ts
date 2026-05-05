// libs/aoc/feature/src/lib/aoc-session.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { SessionCollection, SessionModel } from '@bk2/shared-models';
import { DateFormat, getTodayStr, subDuration } from '@bk2/shared-util-core';

export type DateFilter = 'today' | 'week' | 'all';

export type AocSessionState = {
  dateFilter: DateFilter;
};

const initialState: AocSessionState = {
  dateFilter: 'all',
};

export const AocSessionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
  })),
  withProps(store => ({
    sessionsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({ params }): Observable<SessionModel[]> => {
        const query = [{ key: 'tenants', operator: 'array-contains', value: params.tenantId }];
        return store.firestoreService.searchData<SessionModel>(SessionCollection, query, 'startedAt', 'desc');
      },
    }),
  })),
  withComputed(state => ({
    isLoading: computed(() => state.sessionsResource.isLoading()),
    allSessions: computed(() => state.sessionsResource.value() ?? []),
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withComputed(state => {
    const filterByDate = (sessions: SessionModel[], filter: DateFilter): SessionModel[] => {
      if (filter === 'all') return sessions;
      const today = getTodayStr(DateFormat.StoreDate); // yyyyMMdd
      if (filter === 'today') return sessions.filter(s => s.startedAt.startsWith(today));
      // week: last 7 days
      const weekAgoStr = subDuration(getTodayStr(DateFormat.StoreDate), { days: 7 }, DateFormat.StoreDate);
      return sessions.filter(s => s.startedAt.slice(0, 8) >= weekAgoStr);
    };

    return {
      sessions: computed(() => filterByDate(state.allSessions(), state.dateFilter())),
      activeCount: computed(() => state.allSessions().filter(s => s.isActive).length),
      uniqueUserCount: computed(() => new Set(state.allSessions().filter(s => s.userKey).map(s => s.userKey)).size),
      anonymousCount: computed(() => state.allSessions().filter(s => !s.userKey).length),
    };
  }),
  withMethods(store => ({
    setDateFilter(filter: DateFilter): void {
      patchState(store, { dateFilter: filter });
    },
    reload(): void {
      store.sessionsResource.reload();
    },
  }))
);
