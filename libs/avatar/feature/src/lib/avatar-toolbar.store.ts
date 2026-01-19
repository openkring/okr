import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Photo } from '@capacitor/camera';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { getImageDimensionsFromMetadata, showZoomedImage, updateImageDimensions } from '@bk2/shared-ui';
import { getModelAndKey } from '@bk2/shared-util-core';

import { AvatarService, UploadService } from '@bk2/avatar-data-access';
import { CategoryItemModel, IMAGE_STYLE_SHAPE } from '@bk2/shared-models';
import { ModalController } from '@ionic/angular/standalone';
import { getDefaultIcon } from '@bk2/avatar-util';

export interface AvatarToolbarState {
  key: string; // = ModelType.ModelKey e.g. person.lasdfölj
  modelType: string;
}

export const initialState: AvatarToolbarState = {
  key: '', // The key of the model for which the avatar is displayed
  modelType: '',
};

export const AvatarToolbarStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
    uploadService: inject(UploadService),
    modalController: inject(ModalController),
  })),
  withProps(store => ({
    urlResource: rxResource({
      params: () => ({
        key: store.key(),
        currentUser: store.appStore.currentUser(),
      }),
      stream: ({ params }) => {
        let url$: Observable<string | undefined> = of(undefined);
        if (params.key) {
          url$ = store.avatarService.getRelStorageUrl(params.key)
        }
        return url$;
      },
    }),
  })),

  withComputed(state => {
    return {
      isLoading: computed(() => state.urlResource.isLoading()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      relStorageUrl: computed(() => {
        const url = state.urlResource.value();
        return (url && url.length > 0) ? url : getDefaultIcon(state.modelType());
      }),
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withComputed(state => {
    return {
      url: computed(() => getRelStorageUrl(state.imgixBaseUrl(), state.modelType(), state.relStorageUrl())),
    };
  }),

  withMethods(store => {
    return {
      setKey(key: string) {
        patchState(store, { key });
      },

      setModelType(modelType: string) {
        patchState(store, { modelType });
      },

      async showZoomedImage(title = 'Avatar'): Promise<void> {
        const path = store.relStorageUrl();
        if (path && path.length > 0) {
          let dimensions = await getImageDimensionsFromMetadata(path);

          // if we can not read the dimensions from the image meta data, calculate them from the image file and upload as metadata to firebase storage
          if (!dimensions) {
            dimensions = await updateImageDimensions(path, store.currentUser());
          }
          
          // if we have valid dimensions, show the zoomed image in a modal
          if (dimensions) {
            const imageStyle = IMAGE_STYLE_SHAPE;
            imageStyle.width = dimensions.width;
            imageStyle.height = dimensions.height;
            await showZoomedImage(store.modalController, path, title, imageStyle, title);


          }
/*             const image = newImage('@content.type.article.zoomedImage', path, path);
            image.width = parseInt(dimensions.width);
            image.height = parseInt(dimensions.height);
            image.imageAction = ImageAction.Zoom;
            await store.uploadService.showZoomedImage(image, title ?? '');
          } */
        }
      },

      async uploadPhoto(): Promise<Photo> {
        return await store.uploadService.takePhoto();
      },

      getModelTypeCategoryItemFromKey(): CategoryItemModel | undefined {
        const [modelType, key] = getModelAndKey(store.key());
        return store.appStore.getCategoryItem('model_type', modelType);
      },
    };
  })
);


function getRelStorageUrl(imgixBaseUrl: string, modelType: string, url?: string): string {
  if (!url || url.length === 0) {
    const defaultIcon = getDefaultIcon(modelType);
    return `${imgixBaseUrl}/logo/icons/${defaultIcon}.svg`;
  }
  // now we are sure to have a valid url
  return (url.startsWith(imgixBaseUrl) ? url : `${imgixBaseUrl}/${url}`)
}