import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';
import { I18nService } from '@bk2/shared-i18n';
import { getMetadata, listAll, ref } from 'firebase/storage';

import { STORAGE } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { IconModel } from '@bk2/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, nameMatches } from '@bk2/shared-util-core';

import { UploadService } from '@bk2/avatar-data-access';

import { IconService } from '@bk2/cms-icon-data-access';
import { buildIconModel, buildIconModelFromStorage, getIconStoragePath, ICON_I18N_KEYS, IconI18n } from '@bk2/cms-icon-util';

import { IconEditModal } from './icon-edit.modal';

export type { IconI18n };

export const ICON_SETS = ['filetypes', 'general', 'icons', 'models', 'section'];

export type IconState = {
  selectedDir: string;
  searchTerm: string;
  selectedTag: string;
};

const initialState: IconState = {
  selectedDir: 'icons',
  searchTerm: '',
  selectedTag: ''
};

export const IconStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    iconService: inject(IconService),
    uploadService: inject(UploadService),
    modalController: inject(ModalController),
    storage: inject(STORAGE),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(ICON_I18N_KEYS),
  })),
  withProps((store) => ({
    iconsResource: rxResource({
      params: () => ({ 
        currentUser: store.appStore.currentUser() 
      }),
      stream: ({ params }) =>
        store.iconService.list().pipe(
          debugListLoaded<IconModel>('IconStore.iconsResource', params.currentUser)
        ),
    }),
  })),

  withComputed((store) => ({
    icons: computed(() => store.iconsResource.value() ?? []),
    isLoading: computed(() => store.iconsResource.isLoading()),
    tags: computed(() => store.appStore.getTags('icon')),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId())
  })),

  withComputed((store) => ({
    filteredIcons: computed(() => {
      return store.icons().filter((icon: IconModel) => 
        nameMatches(icon.index, store.searchTerm()) && 
        nameMatches(icon.type, store.selectedDir()) &&
        chipMatches(icon.tags, store.selectedTag()))      
    }),
    iconsCount: computed(() => store.iconsResource.value()?.length ?? 0),
  })),
  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      reload() {
        store.iconsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setSelectedDir(dir: string): void {
        patchState(store, { selectedDir: dir });
      },

      setSearchTerm(term: string): void {
        patchState(store, { searchTerm: term });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('icon');
      },

      /******************************* CRUD on single event  *************************************** */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const file = await store.uploadService.pickFile(['image/svg+xml']);
        if (!file) return;

        // use current filter type or fall back to first available set or 'icons'
        const type = store.selectedDir();
        if (!type || type.length === 0) return;
        const fullPath = getIconStoragePath(type, file.name.replace('.svg', ''));
        const downloadUrl = await store.uploadService.uploadFile(file, `${fullPath}.svg`.replace('.svg.svg', '.svg'), '@icon.operation.upload');
        if (!downloadUrl) return;

        const icon = buildIconModel(file, type, fullPath, store.tenantId());
        await store.iconService.create(icon, store.currentUser());
        this.reload();
      },
/* 
        private async viewIcon(icon: IconModel): Promise<void> {
    const url = (icon.name as string | undefined)
      ? `${icon.name}` // svgIcon pipe resolves the actual URL; use fullPath as fallback
      : icon.fullPath;
    await this.uploadService.showZoomedImage(icon.fullPath, icon.name);
  } */

      async edit(icon: IconModel, isNew: boolean, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: IconEditModal,
          componentProps: {
            icon,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            readOnly: readOnly
          }
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          await store.iconService.update(data as IconModel, store.currentUser());
          this.reload();
        }
      },

      async delete(icon: IconModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.iconService.delete(icon, store.currentUser());
        this.reload();
      },

      /******************************* other *************************************** */
      async export(type: string): Promise<void> {
        console.log(`IconStore.export(${type}) is not yet implemented.`);
      },

      async sync(): Promise<void> {
        const tenantId = store.tenantId();
        const currentUser = store.currentUser();

        // Build a set of already-known icons to avoid duplicates
        const existing = new Set(
          (store.iconsResource.value() ?? []).map((i) => `${i.type}/${i.name}`)
        );

        let created = 0;
        for (const iconSet of ICON_SETS) {
          const dirRef = ref(store.storage, `logo/${iconSet}`);
          const result = await listAll(dirRef);
          const svgItems = result.items.filter((item) => item.name.endsWith('.svg'));

          await Promise.all(
            svgItems.map(async (item) => {
              const name = item.name.replace('.svg', '');
              if (existing.has(`${iconSet}/${name}`)) return; // already in Firestore

              const metadata = await getMetadata(item);
              const updatedDate = convertDateFormatToString(
                metadata.updated.substring(0, 10),
                DateFormat.IsoDate,
                DateFormat.StoreDate
              );
              const icon = buildIconModelFromStorage(
                name,
                iconSet,
                item.fullPath,
                tenantId,
                metadata.size,
                updatedDate
              );
              await store.iconService.create(icon, currentUser);
              created++;
            })
          );
        }

        if (created > 0) {
          this.reload();
        }
        console.log(`IconStore.sync(): created ${created} new icon entries.`);
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
      }
    }
  })
);
