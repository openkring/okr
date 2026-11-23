import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Photo } from '@capacitor/camera';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';
import { ModalController } from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ImageChoices, showZoomedImage } from '@okr/shared-ui';
import { AlertService } from '@okr/shared-util-angular';
import { getModelAndKey, warn } from '@okr/shared-util-core';
import { CategoryItemModel, IMAGE_STYLE_SHAPE } from '@okr/shared-models';

import { AvatarService, UploadService } from '@okr/avatar-data-access';
import { AVATAR_I18N_KEYS, getDefaultIcon } from '@okr/avatar-util';

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
    alertService: inject(AlertService),
    i18n: inject(I18nService).translateAll(AVATAR_I18N_KEYS),
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
      // an icon name handed to the zoom view as a storage path hit storage.rules on the bare
      // path 'person' and threw storage/unauthorized (SCS-4D).
      // The cache comes first: it is live, while the resource reads once per key and would still
      // name the old picture after an upload.
      relStorageUrl: computed(() => (state.key() ? state.avatarService.getCachedStoragePath(state.key()) : null) ?? state.urlResource.value() ?? ''),
    };
  }),

  withComputed(state => {
    return {
      url: computed(() => state.avatarService.getAvatarUrl(state.key(), state.defaultIcon() || getDefaultIcon(state.modelType()))),
    };
  }),

  withMethods(store => {
    const getChoices = async (key: string): Promise<ImageChoices> => ({
      paths: await store.avatarService.listAvatarChoices(key),
      label: store.i18n.choice_label(),
      selectLabel: store.i18n.choice_select(),
      select: async (path) => (await store.alertService.confirm(store.i18n.choice_confirm(), true))
        && store.avatarService.selectAvatar(key, path),
    });

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

      /** @param withChoices also offer the pictures uploaded earlier, to change the avatar */
      async showZoomedImage(title = 'Avatar', withChoices = false): Promise<void> {
        const path = store.relStorageUrl();
        if (path && path.length > 0) {
          try {
            const choices = withChoices ? await getChoices(store.key()) : undefined;
            // The zoom view sizes the image itself (imgix fit=max, w=2000), so it needs no stored
            // dimensions. Pass the shared default style as is: it is a module-level constant that
            // section shapes embed by reference, so it must never be written to.
            await showZoomedImage(store.modalController, path, title, IMAGE_STYLE_SHAPE, title, undefined, undefined, undefined, choices);
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
