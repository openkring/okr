import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { HttpClient } from '@angular/common/http';

import { STORAGE } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ARTICLE_CONFIG_SHAPE, ArticleConfig, ImageConfig } from '@bk2/shared-models';

import { SECTION_I18N_KEYS } from '@bk2/cms-section-util';

export interface ArticleState {
  config: ArticleConfig;
}

export const initialState: ArticleState = {
  config: ARTICLE_CONFIG_SHAPE
};

export const ArticleStore = signalStore(
  withState(initialState),
  withProps(() => ({
    storage: inject(STORAGE),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    httpClient: inject(HttpClient),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS),
  })),

  withComputed((store) => {
    return {
      imgixBaseUrl: computed(() => store.appStore.services.imgixBaseUrl()),
      currentUser: computed(() => store.appStore.currentUser()),
      imageStyle: computed(() => store.config().imageStyle),

      images: computed((): ImageConfig[] => {
        const config = store.config() as any;
        if (!config) return [];
        // backward compat: support legacy single-image field
        if (Array.isArray(config.images) && config.images.length > 0) return config.images;
        if (config.image) return [config.image];    // backward compatibility
        return [];
      })
    };
  }),
  withComputed((store) => {
    return {
      // Single image (only when exactly 1 image is configured)
      image: computed(() => {
        const imgs = store.images();
        return imgs.length === 1 ? imgs[0] : undefined;
      })
    };
  }),

  withMethods((store) => {
    return {
      /******************************* Setters *************************** */

      setConfig(config?: ArticleConfig): void {
        config ??= ARTICLE_CONFIG_SHAPE;
        patchState(store, { config }); 
      }
    }
  })
);
