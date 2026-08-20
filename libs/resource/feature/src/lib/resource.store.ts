import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BOAT_SLOT_NO_COLOR, BoatSlotLabel, BoatTargetCollection, BoatTargetModel, DEFAULT_BOAT_SLOT_COLOR, CategoryListModel, ResourceCollection, ResourceModel, ResourceModelName } from '@okr/shared-models';
import { buildExportTable, chipMatches, debugItemLoaded, getSystemQuery, isResource, nameMatches } from '@okr/shared-util-core';
import { exportCsv, getExportFileName, showToast } from '@okr/shared-util-angular';
import { FirestoreService } from '@okr/shared-data-access';

import { ResourceService } from '@okr/resource-data-access';
import { BoatSlotEditModal } from '@okr/resource-ui';
import { BoatLabelRef, boatLabelKey, boatLabelRefIn, boatTargetKey, isEmptyBoatSlot, PLANNING_WINDOW, getResourceExportColumns, getResourceExportFileName, RESOURCE_I18N_KEYS, ResourceExportList, setUsageFromYear } from '@okr/resource-util';

export type ResourceState = {
  searchTerm: string;
  selectedTag: string;
  selectedResourceType: string;
  selectedSubType: string;
  selectedGender: string;
  resourceKey: string | undefined;    // for resourceEditPage
};

const initialState: ResourceState = {
  searchTerm: '',
  selectedTag: '',
  selectedResourceType: 'all',
  selectedSubType: 'all',
  selectedGender: 'all',
  resourceKey: undefined,
};

export const ResourceStore = signalStore(
  withState(initialState),
  withProps(() => ({
    resourceService: inject(ResourceService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(RESOURCE_I18N_KEYS),

    resourceResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    }),
    resResource: rxResource({
      params: () => ({
        resourceKey: store.resourceKey()
      }),
      stream: ({params}) => {
        return store.resourceService.read(params.resourceKey).pipe(
          debugItemLoaded('ResourceStore.resource', store.appStore.currentUser())
        );
      }
    }),

    /** Bootseinteilung target counts — one document per tenant, id = tenantId. */
    targetResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({params}) => store.firestoreService.readObject<BoatTargetModel>(BoatTargetCollection, params.tenantId),
    }),
  })),

  withComputed((store) => {
    return {
      resources: computed(() => store.resourceResource.value() ?? []),
      resourcesCount: computed(() => store.resourceResource.value()?.length ?? 0), 
      filteredResources: computed(() => 
        store.resourceResource.value()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, store.searchTerm()) &&
          nameMatches(resource.type, store.selectedResourceType()) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      boats: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'boat') ?? []),
      rboats: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'rboat') ?? []),
      cars: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'car') ?? []),
      lockers: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'locker') ?? []),
      keys: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'key') ?? []),
      realestate: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'realestate') ?? []),
      pets: computed(() => store.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'pet') ?? []),
      resource: computed(() => store.resResource.value()),
      boatTargets: computed(() => store.targetResource.value()?.targets ?? {}),
      boatLabels: computed(() => store.targetResource.value()?.labels ?? {}),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      isLoading: computed(() => store.resourceResource.isLoading()),
    };
  }),
  withComputed((store) => {
    return {
      boatsCount: computed(() => store.boats().length ?? 0), 
      filteredBoats: computed(() => 
        store.boats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, store.searchTerm()) &&
          nameMatches(resource.subType, store.selectedSubType()) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      rboatsCount: computed(() => store.rboats().length ?? 0), 
      filteredRboats: computed(() => 
        store.rboats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, store.searchTerm()) &&
          nameMatches(resource.subType, store.selectedSubType(), true) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      carsCount: computed(() => store.cars().length ?? 0),
      filteredCars: computed(() =>
        store.cars()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, store.searchTerm()) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      lockersCount: computed(() => store.lockers().length ?? 0),
      filteredLockers: computed(() =>
        store.lockers()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, store.searchTerm()) &&
          nameMatches(resource.subType, store.selectedGender()) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      keysCount: computed(() => store.keys().length ?? 0),
      filteredKeys: computed(() =>
        store.keys()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, store.searchTerm()) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      realestateCount: computed(() => store.realestate().length ?? 0),
      filteredRealestate: computed(() =>
        store.realestate()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, store.searchTerm()) &&
          chipMatches(resource.tags, store.selectedTag()))
      ),
      petsCount: computed(() => store.pets().length ?? 0),
      filteredPets: computed(() =>
        store.pets()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, store.searchTerm()) &&
          chipMatches(resource.tags, store.selectedTag()))
      )
    }
  }),

  withMethods((store) => {
    return {
      reload() {
        store.resourceResource.reload();
      },
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedResourceType(selectedResourceType: string) {
        patchState(store, { selectedResourceType });
      },

      setSelectedSubType(selectedSubType: string) {
        patchState(store, { selectedSubType });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setResourceKey(resourceKey: string): void {
        patchState(store, { resourceKey });
      },

      /******************************** getters ******************************************* */
      getResourceTags(): string {
        return store.appStore.getTags('resource');
      },

      getTags(type: string): string {
        return store.appStore.getTags(`${ResourceModelName}.${type}`);
      },

      getResourceTypes(): CategoryListModel {
        return store.appStore.getCategory('resource_type');
      },

      /******************************** actions ******************************************* */
      async add(isTypeEditable = false, readOnly = true): Promise<void> {
        if (readOnly) return;
        const resource = new ResourceModel(store.tenantId());
        await this.edit(resource, isTypeEditable, readOnly);
        this.reload();
      },

      async edit(resource: ResourceModel, isTypeEditable = false, readOnly = true): Promise<void> {
        const { ResourceEditModal } = await import('./resource-edit.modal');
        const modal = await store.modalController.create({
          component: ResourceEditModal,
          componentProps: {
            resource,
            isTypeEditable,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isResource(data, store.tenantId())) {
            resource.okey === '' ?
              await store.resourceService.create(data, store.currentUser()) : 
              await store.resourceService.update(data, store.currentUser());
          }
        }
        this.reload();        
      },

      async delete(resource: ResourceModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.resourceService.delete(resource, store.currentUser());
        store.resourceResource.reload();
      },

      /******************************** Bootseinteilung ******************************************* */
      /**
       * Move a rowing boat to another rboat_usage from `year` onwards — earlier seasons keep
       * resolving as they do today (see setUsageFromYear). Same semantics as the boat edit
       * modal: a re-class applies from now on, the history stays what it was.
       */
      async setBoatUsage(boat: ResourceModel, year: number, usage: string, readOnly = true): Promise<void> {
        if (readOnly) return;
        const changed = setUsageFromYear(boat.usage, year, usage);
        if (changed === boat.usage) return;
        await store.resourceService.update({ ...boat, usage: changed }, store.currentUser());
      },

      /** Write one cell of the target-count grid. The doc is created on first write. */
      async setBoatTarget(year: number, usage: string, type: string, count: number, readOnly = true): Promise<void> {
        if (readOnly) return;
        await this.patchBoatTargetDoc({ targets: { [boatTargetKey(year, usage, type)]: count } });
      },

      /** The Bootseinteilung legend as a sheet — dynamic import, the modal reads the AppStore. */
      async showBoatAllocationInfo(): Promise<void> {
        const { BoatAllocationInfoModal } = await import('./boat-allocation-info.modal');
        const modal = await store.modalController.create({ component: BoatAllocationInfoModal });
        await modal.present();
        await modal.onDidDismiss();
      },

      /**
       * Edit the label of one free slot in a modal. An empty text clears the slot again;
       * Firestore has no field-delete here, so it is stored as an empty label.
       */
      async editBoatLabel(ref: BoatLabelRef, label: BoatSlotLabel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const modal = await store.modalController.create({
          component: BoatSlotEditModal,
          componentProps: { slot: label, readOnly }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role !== 'confirm' || !data) return;
        const edited = data as BoatSlotLabel;
        const text = (edited.text ?? '').trim();
        const current: BoatSlotLabel = {
          text,
          color: edited.color ?? DEFAULT_BOAT_SLOT_COLOR,
          isStrategyRelevant: edited.isStrategyRelevant === true,
          strategyType: edited.strategyType ?? 'buy',
          price: Number(edited.price) || 0,
          swisslos: Number(edited.swisslos) || 0,
          donations: Number(edited.donations) || 0,
        };
        // The later seasons carry the TEXT only: the color marks the season the decision belongs
        // to, and copying the strategy fields would book the same purchase six times. A textless
        // label (a boat flagged for the strategy) therefore propagates nothing.
        const follower: BoatSlotLabel = { ...new BoatSlotLabel(), text, color: BOAT_SLOT_NO_COLOR };
        const labels: Record<string, BoatSlotLabel | undefined> = {};
        for (let season = ref.year; season <= ref.year + PLANNING_WINDOW; season++) {
          const label = season === ref.year ? current : follower;
          // emptying a label clears it — and with it the rest of the run
          labels[boatLabelKey(boatLabelRefIn(ref, season))] = isEmptyBoatSlot(label) ? undefined : label;
        }
        await this.patchBoatTargetDoc({ labels });
      },

      /**
       * Merge entries into `targets` / `labels` of the tenant's Bootseinteilung doc. A `labels`
       * entry of `undefined` REMOVES that slot: the write is a full overwrite (set), so a key
       * dropped here is gone from Firestore too.
       */
      async patchBoatTargetDoc(patch: { targets?: Record<string, number>; labels?: Record<string, BoatSlotLabel | undefined> }): Promise<void> {
        const tenantId = store.tenantId();
        const doc = store.targetResource.value() ?? new BoatTargetModel(tenantId);
        await store.firestoreService.updateObject<BoatTargetModel>(BoatTargetCollection, tenantId, {
          ...doc,
          tenants: [tenantId],
          targets: { ...doc.targets, ...patch.targets },
          labels: dropEmptyLabels({ ...doc.labels, ...patch.labels }),
        }, true);
        store.targetResource.reload();
      },

      async save(resource?: ResourceModel): Promise<void> {
        if (!resource) return;
        await (!resource.okey ? 
          store.resourceService.create(resource, store.currentUser()) : 
          store.resourceService.update(resource, store.currentUser()));
      },

      /**
       * Export the currently filtered rows of one of the four resource lists as a CSV file.
       * @param type the export flavour; only 'raw' exists today (menuItem `*-exportraw`)
       * @param listType which list is asking — the store's state does not tell them apart
       */
      async export(type: string, listType: ResourceExportList = 'resource'): Promise<void> {
        if (type !== 'raw') {
          console.warn(`ResourceStore.export: type ${type} is not supported.`);
          return;
        }
        const resources = listType === 'rboat'  ? store.filteredRboats()  ?? [] :
                          listType === 'locker' ? store.filteredLockers() ?? [] :
                          listType === 'key'    ? store.filteredKeys()    ?? [] :
                                                  store.filteredResources() ?? [];
        if (resources.length === 0) {
          showToast(store.toastController, store.i18n.export_empty());
          return;
        }
        // Category item labels are i18n keys, so they must be resolved before the (synchronous)
        // cell accessors run — see I18nService.createLabelResolver.
        const [resourceType, rboatType, rboatUsage, gender] = await Promise.all([
          store.i18nService.createLabelResolver(store.appStore.getCategory('resource_type')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('rboat_type')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('rboat_usage')),
          store.i18nService.createLabelResolver(store.appStore.getCategory('gender')),
        ]);
        const columns = getResourceExportColumns(listType, store.i18n, { resourceType, rboatType, rboatUsage, gender });
        await exportCsv(buildExportTable(resources, columns), getExportFileName(getResourceExportFileName(listType), 'csv'));
        showToast(store.toastController, store.i18n.export_conf());
      }
    }
  }),
);

/** Strip the slots marked for removal before the doc is written — see isEmptyBoatSlot. */
function dropEmptyLabels(labels: Record<string, BoatSlotLabel | undefined>): Record<string, BoatSlotLabel> {
  return Object.fromEntries(Object.entries(labels).filter(([, label]) => !isEmptyBoatSlot(label))) as Record<string, BoatSlotLabel>;
}
