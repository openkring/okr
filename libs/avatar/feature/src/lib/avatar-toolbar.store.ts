import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Photo } from '@capacitor/camera';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { getImageDimensionsFromMetadata, showZoomedImage, updateImageDimensions } from '@okr/shared-ui';
import { getModelAndKey, warn } from '@okr/shared-util-core';
import { CategoryItemModel, IMAGE_STYLE_SHAPE } from '@okr/shared-models';

import { AvatarService, UploadService } from '@okr/avatar-data-access';
import { getDefaultIcon } from '@okr/avatar-util';

export interface AvatarToolbarState {
  key: string; // = ModelType.ModelKey e.g. person.lasdfölj
  modelType: string;
  defaultIcon: string; // overrides the modelType icon shown when the subject has no avatar
}

export const initialState: AvatarToolbarState = {
  key: '', // The key of the model for which the avatar is displayed
  modelType: '',
  defaultIcon: '',
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
      // The real storage path of the avatar, or '' when the subject has none. Never falls back
      // to getDefaultIcon(): that returns an ICON NAME ('person'), not a storage path, and
      // showZoomedImage() below hands this straight to getMetadata() — which then hits
      // storage.rules on the bare path 'person' and throws storage/unauthorized (SCS-4D).
      relStorageUrl: computed(() => state.urlResource.value() ?? ''),
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withComputed(state => {
    return {
      url: computed(() => state.avatarService.getAvatarUrl(state.key(), state.defaultIcon() || getDefaultIcon(state.modelType()))),
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

      setDefaultIcon(defaultIcon: string) {
        patchState(store, { defaultIcon });
      },

      async showZoomedImage(title = 'Avatar'): Promise<void> {
        const path = store.relStorageUrl();
        if (path && path.length > 0) {
          try {
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
          } catch (ex) {
            // a missing/unreadable object must not surface as an unhandled rejection (the two
            // call sites in avatar-toolbar.ts are fire-and-forget click handlers)
            warn(`AvatarToolbarStore.showZoomedImage -> cannot zoom ${path}: ${ex}`);
          }
        }
      },

      async uploadPhoto(): Promise<Photo | undefined> {
        return await store.uploadService.takePhoto();
      },

      getModelTypeCategoryItemFromKey(): CategoryItemModel | undefined {
        const [modelType, key] = getModelAndKey(store.key());
        return store.appStore.getCategoryItem('model_type', modelType);
      },
    };
  })
);
