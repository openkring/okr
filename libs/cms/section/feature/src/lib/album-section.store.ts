import { computed, inject, resource } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { GalleryEffects, getCategoryName } from '@bk2/shared-categories';
import { STORAGE } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { ALBUM_CONFIG_SHAPE, AlbumConfig, AlbumStyle, ImageConfig, ImageType } from '@bk2/shared-models';
import { debugMessage, die } from '@bk2/shared-util-core';

import { getImageMetaData, listAllFilesFromDirectory } from '@bk2/cms-section-util';

import { HttpClient } from '@angular/common/http';
import { GalleryModalComponent } from './gallery.modal';

export interface AlbumState {
  config: AlbumConfig;
  currentDirectory: string; // not the same as config.directory, but the current directory in the album
  currentImage: ImageConfig | undefined; // the currently selected image, if any
}

export const initialState: AlbumState = {
  config: ALBUM_CONFIG_SHAPE,
  currentDirectory: '',
  currentImage: undefined
};

export const AlbumStore = signalStore(
  withState(initialState),
  withProps(() => ({
    storage: inject(STORAGE),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    httpClient: inject(HttpClient)
  })),

  withComputed((state) => {
    return {
      albumStyle: computed(() => state.config()?.albumStyle ?? AlbumStyle.Grid),
      title: computed(() => state.currentDirectory().split('/').pop()),
      currentDirLength: computed(() => state.currentDirectory().split('/').length),
      initialDirLength: computed(() => {
        const initialDir = state.config().directory;
        return !initialDir ? 0 : initialDir.split('/').length;
      }),
      parentDirectory: computed(() => state.currentDirectory().split('/').slice(0, -1).join('/')),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      currentUser: computed(() => state.appStore.currentUser()),
      imageStyle: computed(() => state.config().imageStyle),
    };
  }),

  withProps((store) => ({
    filesResource: resource({
      params: () => store.currentDirectory(),
      loader: async ({ params }) => { // currentDirectory
        if (!params || params.length === 0) return [];
        const files =  await listAllFilesFromDirectory(store.storage, store.config(), store.imgixBaseUrl(), params);
        debugMessage(`AlbumStore.filesResource: loaded ${files.length} files from ${params}`, store.currentUser());
        return files;
      }
    }),

    metaDataResource: resource({
      params: () => store.currentImage(),
      loader: async ({ params }) => { // currentImage
        const meta = await getImageMetaData(store.httpClient, store.imgixBaseUrl(), params);
        debugMessage(`AlbumStore.metaDataResource: loaded metadata for ${params?.url}`, store.currentUser());
        return meta;
      }
    })
  })),

  withComputed((state) => {
    return {
      images: computed(() => state.filesResource.value() || []),
      metaData: computed(() => state.metaDataResource.value() || {}),
      isLoading: computed(() => state.filesResource.isLoading()),
      error: computed(() => state.filesResource.error()),
    }
  }),

  withMethods((store) => {
    return {
      /******************************* Setters *************************** */
      /**
       * Updates the current directory which triggers the loading of all its files.
       * @param directory the new currentDirectory
       */
      setDirectory(currentDirectory?: string): void {
        if (!currentDirectory || currentDirectory.length === 0) return;
        debugMessage(`AlbumStore.setDirectory(${currentDirectory})`, store.currentUser());
        patchState(store, { currentDirectory });
      },

      setImage(image?: ImageConfig): void {
        if (image && image.type !== ImageType.Dir) {
          patchState(store, { currentImage: image });
        } else {
          patchState(store, { currentImage: undefined });
        }
      },

      setAlbumStyle(albumStyle: AlbumStyle): void {
        patchState(store, { config: { ...store.config(), albumStyle } });
      },

      setConfig(config?: AlbumConfig): void {
        config ??= ALBUM_CONFIG_SHAPE;
        config.albumStyle ??= AlbumStyle.Grid;
        config.directory ??= `tenant/${store.appStore.env.tenantId}/album`;
        patchState(store, { config, currentDirectory: config.directory }); 
        debugMessage(`AlbumStore.setConfig: directory=${store.currentDirectory()} and config.`, store.currentUser());
      },

      goUp(): void {
        this.setDirectory(store.parentDirectory());
      },

      async openGallery(files: ImageConfig[], title = '', initialSlide = 0): Promise<void> {
        const images = files.filter((file) => file.type === ImageType.Image);
        const effect = store.config().effect ?? die('AlbumStore.openGallery: gallery effect is mandatory.');
        const modal = await store.modalController.create({
          component: GalleryModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            images,
            imageStyle: store.imageStyle(),
            initialSlide: initialSlide,
            title: title,
            effect: getCategoryName(GalleryEffects, effect)
          }
        });
        modal.present();
    
        await modal.onWillDismiss();
      }
    }
  })
);
