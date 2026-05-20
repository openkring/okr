import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { CategoryListModel, ResourceCollection, ResourceModel, ResourceModelName } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, getSystemQuery, isResource, nameMatches } from '@bk2/shared-util-core';
import { FirestoreService } from '@bk2/shared-data-access';

import { ResourceService } from '@bk2/resource-data-access';

import { ResourceEditModal } from './resource-edit.modal';
import { PFX } from './scope';

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
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      resources:            PFX + 'resources',
      empty:                PFX + 'empty',
      description:          '@description',
      name:                 '@name',
      value:                '@value',
      load:                 PFX + 'load',
      create_label:         PFX + 'create.label',
      view_label:           PFX + 'view.label',
      edit_label:           PFX + 'edit.label',
      delete_label:         PFX + 'delete.label',
      key_plural:           PFX + 'key.plural',
      key_empty:            PFX + 'key.empty',
      key_name:             PFX + 'key.name',
      key_nr:               PFX + 'key.nr',
      key_view:             PFX + 'key.view',
      key_edit:             PFX + 'key.edit',
      key_delete:           PFX + 'key.delete',
      key_create:           PFX + 'key.create',
      locker_plural:        PFX + 'locker.plural',
      locker_empty:         PFX + 'locker.empty',
      locker_nr:            PFX + 'locker.nr',
      locker_view:          PFX + 'locker.view',
      locker_edit:          PFX + 'locker.edit',
      locker_delete:        PFX + 'locker.delete',
      locker_create:        PFX + 'locker.create',
      boat_plural:          PFX + 'boat.plural',
      boat_empty:           PFX + 'boat.empty',
      boat_name:            PFX + 'boat.name',
      boat_type:            PFX + 'boat.type',
      boat_view:            PFX + 'boat.view',
      boat_edit:            PFX + 'boat.edit',
      boat_delete:          PFX + 'boat.delete',
      boat_create:          PFX + 'boat.create',
      rboat_plural:         PFX + 'rboat.plural',
      rboat_empty:          PFX + 'rboat.empty',
      rboat_name:           PFX + 'rboat.name',
      rboat_type:           PFX + 'rboat.type',
      rboat_view:           PFX + 'rboat.view',
      rboat_edit:           PFX + 'rboat.edit',
      rboat_delete:         PFX + 'rboat.delete',
      rboat_create:         PFX + 'rboat.create',
      as_title:             PFX + 'actionsheet.title',
      cancel:               '@cancel',
      ok:                   '@ok'
    }),

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
  })),

  withComputed((state) => {
    return {
      resources: computed(() => state.resourceResource.value() ?? []),
      resourcesCount: computed(() => state.resourceResource.value()?.length ?? 0), 
      filteredResources: computed(() => 
        state.resourceResource.value()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.type, state.selectedResourceType()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      boats: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'boat') ?? []),
      rboats: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'rboat') ?? []),
      cars: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'car') ?? []),
      lockers: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'locker') ?? []),
      keys: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'key') ?? []),
      realestate: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'realestate') ?? []),
      pets: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'pet') ?? []),
      resource: computed(() => state.resResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      isLoading: computed(() => state.resourceResource.isLoading()),
    };
  }),
  withComputed((state) => {
    return {
      boatsCount: computed(() => state.boats().length ?? 0), 
      filteredBoats: computed(() => 
        state.boats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.subType, state.selectedSubType()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      rboatsCount: computed(() => state.rboats().length ?? 0), 
      filteredRboats: computed(() => 
        state.rboats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.subType, state.selectedSubType(), true) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      carsCount: computed(() => state.cars().length ?? 0),
      filteredCars: computed(() =>
        state.cars()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      lockersCount: computed(() => state.lockers().length ?? 0),
      filteredLockers: computed(() =>
        state.lockers()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.subType, state.selectedGender()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      keysCount: computed(() => state.keys().length ?? 0),
      filteredKeys: computed(() =>
        state.keys()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      realestateCount: computed(() => state.realestate().length ?? 0),
      filteredRealestate: computed(() =>
        state.realestate()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      petsCount: computed(() => state.pets().length ?? 0),
      filteredPets: computed(() =>
        state.pets()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
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
            resource.bkey === '' ?
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

      async save(resource?: ResourceModel): Promise<void> {
        if (!resource) return;
        await (!resource.bkey ? 
          store.resourceService.create(resource, store.currentUser()) : 
          store.resourceService.update(resource, store.currentUser()));
      },

      async export(type: string): Promise<void> {
        console.log(`ResourceListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
