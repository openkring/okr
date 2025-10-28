import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Photo } from '@capacitor/camera';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AvatarService } from '@bk2/avatar-data-access';
import { AppStore } from '@bk2/shared-feature';
import { ImageAction, newImage } from '@bk2/shared-models';
import { getImageDimensionsFromMetadata, updateImageDimensions, UploadService } from '@bk2/shared-ui';

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
      stream: ({ params }) => store.avatarService.getRelStorageUrl(params.key),
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
        const path = store.relStorageUrl();
        if (path && path.length > 0) {
          let dimensions = await getImageDimensionsFromMetadata(path);

          // if we can not read the dimensions from the image meta data, calculate them from the image file and upload as metadata to firebase storage
          if (!dimensions) {
            dimensions = await updateImageDimensions(path, store.appStore.currentUser());
          }
          
          // if we have valid dimensions, show the zoomed image in a modal
          if (dimensions) {
            const image = newImage('@content.type.article.zoomedImage', path, path);
            image.width = parseInt(dimensions.width);
            image.height = parseInt(dimensions.height);
            image.imageAction = ImageAction.Zoom;
            await store.uploadService.showZoomedImage(image, title ?? '');
          }
        }
      },

      async uploadPhoto(): Promise<Photo> {
        return await store.uploadService.takePhoto();
      },
    };
  })
);
