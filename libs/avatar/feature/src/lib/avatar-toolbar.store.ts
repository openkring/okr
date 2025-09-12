import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Photo } from '@capacitor/camera';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AvatarService } from '@bk2/avatar-data-access';
import { AppStore } from '@bk2/shared-feature';
import { ImageAction, newImage } from '@bk2/shared-models';
import { UploadService } from '@bk2/shared-ui';

export interface AvatarToolbarState {
  key: string; // = ModelType.ModelKey e.g. 1.lasdfölj
}

export const initialState: AvatarToolbarState = {
  key: '', // The key of the model for which the avatar is displayed
};

export const AvatarToolbarStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
    uploadService: inject(UploadService),
  })),
  withProps(store => ({
    urlResource: rxResource({
      params: () => ({
        key: store.key(),
        currentUser: store.appStore.currentUser(),
      }),
      stream: ({ params }) => store.avatarService.getAvatarImgixUrl(params.key, undefined, undefined, true),
    }),
  })),

  withComputed(state => {
    return {
      isLoading: computed(() => state.urlResource.isLoading()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      relStorageUrl: computed(() => state.urlResource.value() ?? ''),
    };
  }),

  withComputed(state => {
    return {
      url: computed(() => (state.relStorageUrl().startsWith(state.imgixBaseUrl()) ? state.relStorageUrl() : `${state.imgixBaseUrl()}/${state.relStorageUrl()}`)),
    };
  }),

  withMethods(store => {
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
      },
    };
  })
);
