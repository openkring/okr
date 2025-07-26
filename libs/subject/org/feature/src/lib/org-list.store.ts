import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { chipMatches, getSystemQuery, nameMatches } from '@bk2/shared/util-core';
import { AppNavigationService, copyToClipboardWithConfirmation, navigateByUrl } from '@bk2/shared/util-angular';
import { categoryMatches } from '@bk2/shared/categories';
import { AddressModel, AllCategories, ModelType, OrgCollection, OrgModel, OrgType } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { AddressService } from '@bk2/subject/address/data-access';

import { convertFormToNewOrg, convertNewOrgFormToEmailAddress, convertNewOrgFormToPhoneAddress, convertNewOrgFormToPostalAddress, convertNewOrgFormToWebAddress, OrgNewFormModel } from '@bk2/subject/org/util';
import { OrgService } from '@bk2/subject/org/data-access';
import { OrgNewModalComponent } from './org-new.modal';
import { FirestoreService } from '@bk2/shared/data-access';

export type OrgListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: OrgType | typeof AllCategories;
};
export const initialState: OrgListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: AllCategories,
};

export const OrgListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    orgService: inject(OrgService),
    addressService: inject(AddressService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    orgsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc')
      }
    }),
  })),
  withComputed((state) => ({
    orgs: computed(() => {
      const value = state.orgsResource.value();
      console.log('Computed orgs:', value?.length);
      return value;
    }),
    orgsCount: computed(() => state.orgsResource.value()?.length ?? 0),
    isLoading: computed(() => state.orgsResource.isLoading()),
    filteredOrgs: computed(() =>
      state.orgsResource.value()?.filter((org: OrgModel) =>
        nameMatches(org.index, state.searchTerm()) &&
        categoryMatches(org.type, state.selectedType()) &&
        chipMatches(org.tags, state.selectedTag())
      ) ?? []
    ),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),
  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
      store.orgsResource.reload();
    },
    reload() {
      store.orgsResource.reload();
    },
    printState() {
      console.log('------------------------------------');
      console.log('OrgListStore state:');
      console.log('  searchTerm: ' + store.searchTerm());
      console.log('  selectedTag: ' + store.selectedTag());
      console.log('  selectedOrgType: ' + store.selectedType());
      console.log('  orgs: ' + JSON.stringify(store.orgs()));
      console.log('  orgsCount: ' + store.orgsCount());
      console.log('  filteredOrgs: ' + JSON.stringify(store.filteredOrgs()));
      console.log('  currentUser: ' + JSON.stringify(store.currentUser()));
      console.log('  tenantId: ' + store.tenantId());
      console.log('------------------------------------');
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setSelectedType(selectedType: OrgType | typeof AllCategories) {
      patchState(store, { selectedType });
    },
    setSelectedTag(selectedTag: string) {
      patchState(store, { selectedTag });
    },
    getOrgTags(): string {
      return store.appStore.getTags(ModelType.Org);
    },
    async export(type: string): Promise<void> {
      console.log(`OrgListStore.export(${type}) is not yet implemented.`);
    },
    async add(): Promise<void> {
      const _modal = await store.modalController.create({
        component: OrgNewModalComponent,
        componentProps: {
          currentUser: store.currentUser()
        }
      });
      _modal.present();
      const { data, role } = await _modal.onDidDismiss();
      if (role === 'confirm') {
        const _vm = data as OrgNewFormModel;
        const _key = ModelType.Org + '.' + await store.orgService.create(convertFormToNewOrg(_vm, store.tenantId()), store.currentUser());
        if ((_vm.email ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToEmailAddress(_vm, store.tenantId()), _key);
        }
        if ((_vm.phone ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToPhoneAddress(_vm, store.tenantId()), _key);
        }
        if ((_vm.web ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToWebAddress(_vm, store.tenantId()), _key);
        }
        if ((_vm.city ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToPostalAddress(_vm, store.tenantId()), _key);
        }
      }
      store.orgsResource.reload();
    },

    saveAddress(address: AddressModel, orgKey: string): void {
      address.parentKey = orgKey;
      store.addressService.create(address, store.currentUser());
    },

    /**
     * tbd: known bug in rxjs-interop (confirmed by Gemini 2.5pro after many fix attempts)
     * When navigating off the list page, the list component is destroyed.
     * This triggers AbortSignal in rxjs-interop, which should be caught in the loader.
     * But there seems to be an issue in rxjs-interop, which causes the loader to fail with a TypeError.
     * TypeError: Cannot read properties of undefined (reading 'unsubscribe') (in rxjs-interop)
     * Neither finalize nor catchError are called.
     * As the functionality seems to be working, we ignore the error for now.
     * @param org 
     * @returns 
     */
    async edit(org?: OrgModel): Promise<void> {
      console.log('OrgListStore.edit: ' + JSON.stringify(org));
      if (!org?.bkey || org.bkey.length === 0) return;
      store.appNavigationService.pushLink('/org/all');
      await navigateByUrl(store.router, `/org/${org.bkey}`);
      // store.orgsResource.reload();
    },
    async delete(org?: OrgModel): Promise<void> {
      if (!org) return;
      await store.orgService.delete(org, store.currentUser());
      this.reset();
    },
    async copyEmailAddresses(): Promise<void> {
      const _allEmails = store.filteredOrgs().map((_org) => _org.fav_email);
      const _emails = _allEmails.filter((e) => e);
      await copyToClipboardWithConfirmation(
        store.toastController,
        _emails.toString() ?? '',
        '@subject.address.operation.emailCopy.conf'
      );
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