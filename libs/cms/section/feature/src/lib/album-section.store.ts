import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject, resource } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';

import { STORAGE } from '@bk2/shared/config';
import { AlbumConfig, AlbumStyle, Image, ImageType } from '@bk2/shared/models';
import { debugMessage, die } from '@bk2/shared/util-core';
import { GalleryEffects, getCategoryName } from '@bk2/shared/categories';
import { AppStore } from '@bk2/shared/feature';

import { getImageMetaData, listAllFilesFromDirectory, newAlbumConfig } from '@bk2/cms/section/util';
import { GalleryModalComponent } from './gallery.modal';
import { HttpClient } from '@angular/common/http';

export interface AlbumState {
  config: AlbumConfig;
  currentDirectory: string; // not the same as config.directory, but the current directory in the album
  currentImage: Image | undefined; // the currently selected image, if any
}

export const initialState: AlbumState = {
  config: newAlbumConfig(),
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
      albumStyle: computed(() => state.config().albumStyle),
      title: computed(() => state.currentDirectory().split('/').pop()),
      currentDirLength: computed(() => state.currentDirectory().split('/').length),
      initialDirLength: computed(() => {
        const _initialDir = state.config().directory;
        return !_initialDir ? 0 : _initialDir.split('/').length;
      }),
      parentDirectory: computed(() => state.currentDirectory().split('/').slice(0, -1).join('/')),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withProps((store) => ({
    filesResource: resource({
      request: () => store.currentDirectory(),
      loader: async ({ request }) => { // currentDirectory
        if (!request || request.length === 0) return [];
        const _files =  await listAllFilesFromDirectory(store.storage, store.config(), store.imgixBaseUrl(), request);
        debugMessage(`AlbumStore.filesResource: loaded ${_files.length} files from ${request}`, store.currentUser());
        return _files;
      }
    }),

    metaDataResource: resource({
      request: () => store.currentImage(),
      loader: async ({ request }) => { // currentImage
        const _meta = await getImageMetaData(store.httpClient, store.imgixBaseUrl(), request);
        debugMessage(`AlbumStore.metaDataResource: loaded metadata for ${request?.url}`, store.currentUser());
        return _meta;
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

      setImage(image?: Image): void {
        if (image && image.imageType !== ImageType.Dir) {
          patchState(store, { currentImage: image });
        } else {
          patchState(store, { currentImage: undefined });
        }
      },

      setAlbumStyle(albumStyle: AlbumStyle): void {
        patchState(store, { config: { ...store.config(), albumStyle } });
      },

      setConfig(config?: AlbumConfig): void {
        config ??= newAlbumConfig();
        config.albumStyle ??= AlbumStyle.Grid;
        config.directory ??= `tenant/${store.appStore.env.tenantId}/album`;
        patchState(store, { config, currentDirectory: config.directory }); 
        debugMessage(`AlbumStore.setConfig: directory=${store.currentDirectory()} and config.`, store.currentUser());
      },

      goUp(): void {
        this.setDirectory(store.parentDirectory());
      },

      async openGallery(files: Image[], title = '', initialSlide = 0): Promise<void> {
        const _images = files.filter((file) => file.imageType === ImageType.Image);
        const _effect = store.config().galleryEffect ?? die('AlbumStore.openGallery: gallery effect is mandatory.');
        const _modal = await store.modalController.create({
          component: GalleryModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            imageList: _images,
            initialSlide: initialSlide,
            title: title,
            effect: getCategoryName(GalleryEffects, _effect)
          }
        });
        _modal.present();
    
        await _modal.onWillDismiss();
      }
    }
  })
);
