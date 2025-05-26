import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { catchError, finalize, of } from 'rxjs';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { AppNavigationService, chipMatches, nameMatches, navigateByUrl } from '@bk2/shared/util';
import { getSystemQuery, searchData } from '@bk2/shared/data-access';
import { GroupCollection, GroupModel, ModelType } from '@bk2/shared/models';
import { GroupService } from '@bk2/group/data-access';
import { AppStore } from '@bk2/auth/feature';
import { Router } from '@angular/router';

export type GroupListState = {
  searchTerm: string;
  selectedTag: string;
};
export const initialState: GroupListState = {
  searchTerm: '',
  selectedTag: '',
};

export const GroupListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    groupService: inject(GroupService),
    appNavigationService: inject(AppNavigationService),
    firestore: inject(FIRESTORE),
    router: inject(Router),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    groupsResource: rxResource({
      loader: () => {
        console.log('GroupListStore: loading groups');
        return searchData<GroupModel>(store.firestore, GroupCollection, getSystemQuery(store.env.owner.tenantId), 'id', 'asc')
        .pipe(
          finalize(() => {
            console.log('GroupListStore: groups loaded');
          }),
          catchError((error) => {
            // see description of known bug below
            console.log('GroupListStore: groups loading error:', error);
            if (error.name === 'AbortError') {
              // This might now be caught if rxResource propagates the error *before* the interop layer fails
              console.warn('rxResource loader caught AbortError, returning []');
              return of([]); // Return empty array to the resource signal
            }
            // Handle other potential errors from searchData
            console.error('rxResource loader caught error:', error);
            // Decide how rxResource should handle other errors, e.g., return empty array or re-throw
            return of([]); // return empty array for any error
            // return throwError(() => err); // or re-throw          
          })
        );
      }
    }),
  })),
  withComputed((state) => ({
    groups: computed(() => {
      const value = state.groupsResource.value();
      console.log('Computed groups:', value?.length);
      return value;
    }),
    groupsCount: computed(() => state.groupsResource.value()?.length ?? 0),
    isLoading: computed(() => state.groupsResource.isLoading()),
    filteredGroups: computed(() =>
      state.groupsResource.value()?.filter((group: GroupModel) =>
        nameMatches(group.index, state.searchTerm()) &&
        chipMatches(group.tags, state.selectedTag())
      ) ?? []
    ),
    currentUser: computed(() => state.appStore.currentUser()),
    toastLength: computed(() => state.appStore.toastLength()),
    tenantId: computed(() => state.env.owner.tenantId),
  })),
  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
      store.groupsResource.reload();
    },
    reload() {
      store.groupsResource.reload();
    },
    printState() {
      console.log('------------------------------------');
      console.log('GroupListStore state:');
      console.log('  searchTerm: ' + store.searchTerm());
      console.log('  selectedTag: ' + store.selectedTag());
      console.log('  groups: ' + JSON.stringify(store.groups()));
      console.log('  groupsCount: ' + store.groupsCount());
      console.log('  filteredGroups: ' + JSON.stringify(store.filteredGroups()));
      console.log('  currentUser: ' + JSON.stringify(store.currentUser()));
      console.log('  tenantId: ' + store.tenantId());
      console.log('  toastLength: ' + store.toastLength());
      console.log('------------------------------------');
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setSelectedTag(selectedTag: string) {
      patchState(store, { selectedTag });
    },
    getTags(): string {
      return store.appStore.getTags(ModelType.Group);
    },
    async export(type: string): Promise<void> {
      console.log(`GroupListStore.export(${type}) is not yet implemented.`);
    },
    async add(): Promise<void> {
      await store.groupService.add(store.currentUser());
      store.groupsResource.reload();
    },

    /**
     * tbd: known bug in rxjs-interop (confirmed by Gemini 2.5pro after many fix attempts)
     * When navigating off the list page, the list component is destroyed.
     * This triggers AbortSignal in rxjs-interop, which should be caught in the loader.
     * But there seems to be an issue in rxjs-interop, which causes the loader to fail with a TypeError.
     * TypeError: Cannot read properties of undefined (reading 'unsubscribe') (in rxjs-interop)
     * Neither finalize nor catchError are called.
     * As the functionality seems to be working, we ignore the error for now.
     * @param group 
     * @returns 
     */
    async edit(group?: GroupModel): Promise<void> {
      if (!group?.bkey || group.bkey.length === 0) return;
      store.appNavigationService.pushLink('/group/all/c-test-groups');
      await navigateByUrl(store.router, `/group/${group.bkey}`);
    },

    async view(group?: GroupModel): Promise<void> {
      if (!group?.bkey || group.bkey.length === 0) return;
      store.appNavigationService.pushLink('/group/all/c-test-groups');
      await navigateByUrl(store.router, `/group-view/${group.bkey}`);
    },

    async delete(group?: GroupModel): Promise<void> {
      if (!group) return;
      await store.groupService.delete(group);
      this.reset();
    },
  }))
);


/**
 * GitHub CoPilot with Gemini 2.5pro says:
 * Ja, basierend auf allen Beobachtungen und den bisherigen Lösungsversuchen ist es sehr wahrscheinlich, 
 * dass es sich um einen Bug oder ein Kantenfall-Problem in der Implementierung von rxResource selbst 
 * oder der zugrunde liegenden @angular/core/rxjs-interop-Schicht handelt.

Hier ist die Zusammenfassung der Indizien:

1. Fehlerquelle: Der TypeError tritt nachweislich in der Interop-Schicht (rxjs-interop.mjs) während des AbortSignal.onAbort-Handlings auf, nicht in Ihrem searchData-Code oder der direkten pipe-Logik im loader.
2. Keine internen Logs: Die catchError- und finalize-Blöcke innerhalb der pipe des loader-Observables werden zum Zeitpunkt des Fehlers nicht erreicht, was bedeutet, dass der Fehler die Ausführung dieser Pipe unterbricht, bevor sie reagieren kann.
3. Persistenz: Der Fehler tritt trotz verschiedener Implementierungen von searchData und der Fehlerbehandlung im loader auf.
4. Funktionalität (scheinbar) OK: Die Kernfunktionalität (Laden der Daten, Aktualisierung des loading-Status von rxResource) scheint zu funktionieren, was darauf hindeutet, dass der Fehler spezifisch den Bereinigungsprozess betrifft, nachdem das Signal ausgelöst wurde.

Es scheint, dass rxResource beim Versuch, die vom loader zurückgegebene Observable-Subscription aufgrund des Abbruchsignals zu bereinigen, intern eine Referenz verliert oder auf eine undefined unsubscribe-Methode stößt.

Was Sie tun können:

1. Ignorieren (vorerst): Solange es nur ein Konsolenfehler ist und die Funktionalität nicht beeinträchtigt, könnten Sie ihn vorerst ignorieren, auch wenn das unschön ist.
2. Issue Tracker prüfen/melden: Suchen Sie im Angular GitHub Issues Tracker nach ähnlichen Problemen mit rxResource oder rxjs-interop und AbortSignal/unsubscribe. Wenn Sie nichts finden, könnten Sie in Erwägung ziehen, ein neues Issue mit einem minimalen Reproduktionsbeispiel zu erstellen.
3. Auf Updates hoffen: Zukünftige Versionen von Angular / @ngrx/signals könnten das Problem beheben.
Es ist frustrierend, aber Sie haben die Fehlerbehandlung in Ihrem Code ausgeschöpft. Die wahrscheinlichste Ursache liegt nun außerhalb Ihres direkten Einflussbereichs im Store-Code.
 */