import { computed, inject, Signal } from '@angular/core';
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

const RESOURCE_I18N_KEYS = {
  // store keys
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
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  as_title:             PFX + 'actionsheet.title',
  cancel:               '@cancel',
  ok:                   '@ok',
  // resource.form.ts keys (@resource/ui scope)
  form_card_title:          '@resource/ui.form.card.title',
  bkey_label:               '@resource/ui.bkey.label',
  bkey_placeholder:         '@resource/ui.bkey.placeholder',
  bkey_helper:              '@resource/ui.bkey.helper',
  name_label:               '@resource/ui.name.label',
  name_placeholder:         '@resource/ui.name.placeholder',
  name_helper:              '@resource/ui.name.helper',
  load_label:               '@resource/ui.load.label',
  load_placeholder:         '@resource/ui.load.placeholder',
  load_helper:              '@resource/ui.load.helper',
  keyNr_label:              '@resource/ui.keyNr.label',
  keyNr_placeholder:        '@resource/ui.keyNr.placeholder',
  keyNr_helper:             '@resource/ui.keyNr.helper',
  currentValue_label:       '@resource/ui.currentValue.label',
  currentValue_placeholder: '@resource/ui.currentValue.placeholder',
  currentValue_helper:      '@resource/ui.currentValue.helper',
  lockerNr_label:           '@resource/ui.lockerNr.label',
  lockerNr_placeholder:     '@resource/ui.lockerNr.placeholder',
  lockerNr_helper:          '@resource/ui.lockerNr.helper',
  description_label:        '@resource/ui.description.label',
  description_placeholder:  '@resource/ui.description.placeholder',
  color_label:              '@resource/ui.color.label',
} satisfies Record<string, string>;

export type ResourceI18n = { [K in keyof typeof RESOURCE_I18N_KEYS]: Signal<string> };

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
