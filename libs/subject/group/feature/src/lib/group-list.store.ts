import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { chipMatches, getSystemQuery, nameMatches } from '@bk2/shared/util-core';
import { AppNavigationService, navigateByUrl } from '@bk2/shared/util-angular';
import { GroupCollection, GroupModel, ModelType } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { GroupService } from '@bk2/subject/group/data-access';
import { convertFormToNewGroup, GroupNewFormModel } from '@bk2/subject/group/util';
import { GroupNewModalComponent } from './group-new.modal';
import { FirestoreService } from '@bk2/shared/data-access';

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
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    groupsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(store.appStore.tenantId()), 'id', 'asc')
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
    tenantId: computed(() => state.appStore.tenantId()),
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

    /**
     * Fetches the avatar URL for the author, assignee, and scope of the group.
     * @returns an object containing the URLs and names of the author, assignee, and
     */
    async add(): Promise<void> {
      const _modal = await store.modalController.create({
        component: GroupNewModalComponent,
        componentProps: {
          currentUser: store.currentUser()
        }
      });
      _modal.present();
      const { data, role } = await _modal.onDidDismiss();
      if (role === 'confirm') {
        const _vm = data as GroupNewFormModel;
        const _key = ModelType.Group + '.' + await this.saveGroup(_vm);
        // tbd: save avatar image if provided
        console.log(`GroupListStore.add: new group created with key ${_key}`);
      }
      store.groupsResource.reload();
    },

    /**
     * Saves a new group.
     * @param groupFormModel the form model containing the new group data
     * @returns the key of the newly created group or undefined if the creation failed
     */
    async saveGroup(groupFormModel: GroupNewFormModel): Promise<string | undefined> {
      return await store.groupService.create(convertFormToNewGroup(groupFormModel, store.tenantId()), store.currentUser());
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
      await store.groupService.delete(group, store.currentUser());
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