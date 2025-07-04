import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { rxResource } from '@angular/core/rxjs-interop';

import { ImageAction, newImage } from '@bk2/shared/models';
import { UploadService } from '@bk2/shared/ui';
import { getAvatarImgixUrl } from '@bk2/shared/pipes';
import { AppStore } from '@bk2/shared/feature';
import { THUMBNAIL_SIZE } from '@bk2/shared/constants';

export interface AvatarToolbarState {
  key: string;              // = ModelType.ModelKey e.g. 1.lasdfölj
}

export const initialState: AvatarToolbarState = {
  key: '',                  // The key of the model for which the avatar is displayed
};

export const AvatarToolbarStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    uploadService: inject(UploadService),
  })),
  withProps((store) => ({
    urlResource: rxResource({
      params: () => ({
        key: store.key(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => getAvatarImgixUrl(store.appStore.firestore, params.key, THUMBNAIL_SIZE, store.appStore.env.services.imgixBaseUrl, false)      
    })
  })),

  withComputed((state) => {
    return {
      isLoading: computed(() => state.urlResource.isLoading()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      relStorageUrl: computed(() => state.urlResource.value() ?? ''),
    };
  }),

  withComputed((state) => {
    return {
      url: computed(() => (state.relStorageUrl().startsWith(state.imgixBaseUrl())) ? state.relStorageUrl() : `${state.imgixBaseUrl()}/${state.relStorageUrl()}`),
    };
  }),


  withMethods((store) => {
    return {

      setKey(key: string) {
        patchState(store, { key });
      },

      async showZoomedImage(title?: string): Promise<void> {
        const _url = store.relStorageUrl();
        if (_url && _url.length > 0) {
          const _image = newImage('@content.type.article.zoomedImage', _url, _url);
          _image.width = 160;
          _image.height = 83;
          _image.imageAction = ImageAction.Zoom;
          await store.uploadService.showZoomedImage(_image, title ?? '');
        } 
      },

      async uploadPhoto(): Promise<Photo> {
        return await store.uploadService.takePhoto();
      }
    }
  })
);
