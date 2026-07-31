import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ownerTypeMatches } from '@okr/shared-categories';
import { AppStore } from '@okr/shared-feature';
import { OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@okr/shared-models';
import { selectDate } from '@okr/shared-ui';
import { confirm, exportCsv, getExportFileName, navigateByUrl, showToast } from '@okr/shared-util-angular';
import { buildExportTable, chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isAfterDate, isOwnership, nameMatches } from '@okr/shared-util-core';
import { DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { OwnershipService } from '@okr/relationship-ownership-data-access';
import { getOwnershipExportColumns, getOwnershipExportFileName, newOwnership, OWNERSHIP_I18N_KEYS } from '@okr/relationship-ownership-util';

export type OwnershipState = {
  // accordion state
  ownerModelType: 'person' | 'org';
  ownerKey: string;
  showOnlyCurrent: boolean;
  resourceKey: string;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedOwnershipType: string;
  selectedResourceType: string;
  selectedYear: number;
  selectedModelType: 'person' | 'org' | 'all';
  selectedGender: string;
  selectedOrgType: string;
  selectedRowingBoatType: string;
  yearField: 'validFrom' | 'validTo';
};

const initialState: OwnershipState = {
  ownerKey: '',
  showOnlyCurrent: false,
  ownerModelType: 'person',
  resourceKey: '',

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedOwnershipType: 'all',
  selectedResourceType: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedModelType: 'all',
  selectedGender: 'all',
  selectedOrgType: 'all',
  selectedRowingBoatType: 'all',
  yearField: 'validFrom',
};


export const OwnershipStore = signalStore(
  withState(initialState),
  withProps(() => ({
    ownershipService: inject(OwnershipService),
    appStore: inject(AppStore),
    router: inject(Router),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService)
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(OWNERSHIP_I18N_KEYS),

    // all ownerships of this tenant
    allOwnershipsResource: rxResource({
      stream: () => {
        return store.ownershipService.list().pipe(
          debugListLoaded('OwnershipStore.allOwnerships', store.appStore.currentUser())
        );
      }
    })
  })),

  // list types
  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.appStore.tenantId()),

      // all ownerships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allOwnerships: computed(() => state.showOnlyCurrent() ? 
        state.allOwnershipsResource.value()?.filter(m => isAfterDate(m.validTo, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allOwnershipsResource.value() ?? []),

      isLoading: computed(() => state.allOwnershipsResource.isLoading()),

      // all ownerships of a given owner (person or org). This can be used e.g. in ownership-accordion
      ownerships: computed(() => {
        if (!state.ownerKey() || state.ownerKey().length === 0) return [];
        if (!state.ownerModelType()) return [];
        return state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.ownerKey === state.ownerKey()) ?? []
      }),

      // all owners of a given resource
      owners: computed(() => {
        if (!state.ownerKey() || state.ownerKey().length === 0) return [];
        return Array.from(new Set(state.allOwnershipsResource.value()
          ?.filter((ownership: OwnershipModel) => ownership.resourceKey === state.ownerKey())
          .map((ownership: OwnershipModel) => ownership.ownerKey)));
      }),

      lockers: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'locker' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      keys: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'key' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      privateBoats: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
        ownership.ownerModelType === 'person' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),
  
      scsBoats: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
        ownership.ownerKey === 'scs' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? [])
    };
  }),

  // filters
  withComputed((state) => {
    return {
      // all ownerships
      allOwnershipsCount: computed(() => state.allOwnerships().length),
      ownershipsCount: computed(() => state.ownerships().length),
      filteredAllOwnerships: computed(() => 
        state.allOwnerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      filteredOwnerships: computed(() => 
        state.ownerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // lockers
      lockersCount: computed(() => state.lockers().length ?? 0), 
      filteredLockers: computed(() =>
        state.lockers().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // keys
      keysCount: computed(() => state.keys().length ?? 0), 
      filteredKeys: computed(() => 
        state.keys()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // private boats
      privateBoatsCount: computed(() => state.privateBoats().length ?? 0), 
      filteredPrivateBoats: computed(() => 
        state.privateBoats()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      
      // scs boats
      scsBoatsCount: computed(() => state.scsBoats().length ?? 0), 
      filteredScsBoats: computed(() => 
        state.scsBoats()?.filter((ownership: OwnershipModel) => 
        nameMatches(ownership.index, state.searchTerm()) &&
        chipMatches(ownership.tags, state.selectedTag()) &&
        nameMatches(ownership.resourceSubType ?? DEFAULT_RBOAT_TYPE, state.selectedRowingBoatType())
      )),
    }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },
      reload() {
        store.allOwnershipsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setOwnerKey(ownerKey: string) {
        patchState(store, { ownerKey });
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      setYearField(yearField: 'validFrom' | 'validTo') {
        patchState(store, { yearField });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedOwnershipType(selectedOwnershipType: string) {
        patchState(store, { selectedOwnershipType });
      },

      setSelectedResourceType(selectedResourceType: string) {
        patchState(store, { selectedResourceType });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender, selectedModelType: 'person' });
      },

      setSelectedOrgType(selectedOrgType: string) {
        patchState(store, { selectedOrgType, selectedModelType: 'org' });
      },

      setSelectedRowingBoatType(selectedRowingBoatType: string) {
        patchState(store, { selectedRowingBoatType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedOwnerType(ownerType: string) {
        switch(ownerType) {
          case 'persons': 
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'all',
            }); 
            break;
          case 'men':     
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'male',
            }); 
            break;
          case 'women':   
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'female',
            }); 
            break;
          case 'orgs':     
            patchState(store, {
              selectedModelType: 'org',
              selectedOrgType: 'all',
            }); 
            break;
          case 'all':
            patchState(store, {
              selectedModelType: 'all',
              selectedGender: 'all',
              selectedOrgType: 'all',
            });
            break;
          default:
            die('OwnershipListStore: unknown ownerType ' + ownerType);
        }
      },

      setOwner(ownerKey: string, ownerModelType: 'person' | 'org'): void {
        patchState(store, { ownerKey, ownerModelType });
        this.reload();
      },  

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('ownership');
      },

      /******************************* actions *************************************** */
      /**
       * Show a modal to add a new Ownership.
       * @param readOnly 
       * @returns 
       */
      async add(givenOwner?: PersonModel | OrgModel, ownerModelType: 'person' | 'org' = 'person', givenResource?: ResourceModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const owner = givenOwner ?? store.appStore.currentPerson();
        const resource = givenResource ?? store.appStore.defaultResource();
        if (!owner || !resource) return;
        const ownership = newOwnership(owner, resource, store.tenantId(), ownerModelType);
        const { OwnershipNewModal } = await import('./ownership-new.modal');
        const modal = await store.modalController.create({
          component: OwnershipNewModal,
          cssClass: 'small-modal',
          componentProps: {
            ownership,
            currentUser: store.appStore.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isOwnership(data, store.tenantId())) {
            await store.ownershipService.create(data, store.currentUser());
          }
        }
        this.reload();
      },

      /**
       * Show a modal to edit an existing Ownership.
       * @param ownership the Ownership to edit
       * @param readOnly 
       */
      async edit(ownership: OwnershipModel, readOnly = true): Promise<void> {
        const { OwnershipEditModal } = await import('./ownership-edit.modal');
        const modal = await store.modalController.create({
          component: OwnershipEditModal,
          componentProps: {
            ownership,
            currentUser: store.currentUser(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isOwnership(data, store.tenantId())) {
            await (!data.okey ? 
              store.ownershipService.create(data, store.currentUser()) : 
              store.ownershipService.update(data, store.currentUser()));
          }
        }
        this.reload();
      },

      /**
       * End an existing Ownership.
       * We do not archive ownerships as we want to make them visible in the lists.
       * Therefore, we end an ownership by setting its validTo date.
       * @param ownership the Ownership to delete, its okey needs to be valid so that we can find it in the database. 
       */
      async end(ownership: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.ownershipService.endOwnershipByDate(ownership, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          this.reload();
        }
      },   

      /**
       * Navigate to the detail page of the owned resource (e.g. a rowing boat).
       * @param ownership the Ownership whose resource should be opened
       * @param readOnly whether the resource page opens in read-only (view) mode
       */
      async openResource(ownership: OwnershipModel, readOnly = true): Promise<void> {
        if (!ownership.resourceKey) return;
        await navigateByUrl(store.router, `/resource/${ownership.resourceKey}`, { readOnly });
      },

      /**
       * Navigate to the detail page of the owner (person or org).
       * @param ownership the Ownership whose owner should be opened
       * @param readOnly whether the owner page opens in read-only (view) mode
       */
      async openOwner(ownership: OwnershipModel, readOnly = true): Promise<void> {
        if (!ownership.ownerKey) return;
        const path = ownership.ownerModelType === 'org' ? 'org' : 'person';
        await navigateByUrl(store.router, `/${path}/${ownership.ownerKey}`, { readOnly });
      },

      /**
       * Export the currently filtered rows of an ownership list as a CSV file.
       * @param type the export flavour; only 'raw' exists today (menuItem `ownership-exportraw`)
       * @param listId the list being exported — it decides both the rows and the columns
       */
      async export(type: string, listId = 'all'): Promise<void> {
        if (type !== 'raw') {
          console.warn(`OwnershipStore.export: type ${type} is not supported.`);
          return;
        }
        const ownerships = listId === 'ownerships'   ? store.filteredOwnerships()   ?? [] :
                           listId === 'lockers'      ? store.filteredLockers()      ?? [] :
                           listId === 'keys'         ? store.filteredKeys()         ?? [] :
                           listId === 'privateBoats' ? store.filteredPrivateBoats() ?? [] :
                           listId === 'scsBoats'     ? store.filteredScsBoats()     ?? [] :
                                                       store.filteredAllOwnerships() ?? [];
        if (ownerships.length === 0) {
          showToast(store.toastController, store.i18n.export_empty());
          return;
        }
        // Coded values render as i18n keys, so they must be resolved before the (synchronous)
        // cell accessors run. `type` and `state` have no category document behind them — the
        // value resolver falls back to the raw code when a key is missing.
        const [resourceType, rboatType, gender, ownershipType, state] = await Promise.all([
          store.i18nService.createLabelResolver(store.appStore.getCategory('resource_type')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('rboat_type')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('gender')),
          store.i18nService.createValueResolver('@relationship/ownership/feature.type', ownerships.map(o => o.type)),
          store.i18nService.createValueResolver('@relationship/ownership/feature.state', ownerships.map(o => o.state)),
        ]);
        const columns = getOwnershipExportColumns(listId, store.i18n, { resourceType, rboatType, gender, type: ownershipType, state });
        await exportCsv(buildExportTable(ownerships, columns), getExportFileName(getOwnershipExportFileName(listId), 'csv'));
        showToast(store.toastController, store.i18n.export_conf());
      },

      async delete(ownership?: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
          if (result === true) {
            await store.ownershipService.delete(ownership, store.currentUser());
            this.reload();
          }
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
  }),
);
