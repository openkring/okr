import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { MenuService } from '@bk2/cms/menu/data-access';
import { rxResource } from '@angular/core/rxjs-interop';
import { AppStore } from '@bk2/shared/feature';
import { debugMessage } from '@bk2/shared/util-core';
import { of } from 'rxjs';

export type MenuState = {
  name: string;
};

export const initialState: MenuState = {
  name: '',
};

export const MenuStore = signalStore(
  withState(initialState),
  withProps(() => ({
    menuService: inject(MenuService),
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    menuResource: rxResource({
      params: () => ({
        name: store.name(),
        user: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        if (!params.name || params.name.length === 0) {
          return of(undefined);
        }
        debugMessage(`MenuStore: loading menu with name:${params.name}`, params.user);
        return store.menuService.read(params.name);
      }
    })
  })),

  withComputed((state) => {
    return {
      menu: computed(() => state.menuResource.value() ?? undefined),
      isLoading: computed(() => state.menuResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      /**
       * Updates the menu name which triggers the loading of the menu.
       * @param name the key of the menu
       */
      setMenuName(name: string) {
        patchState(store, { name });
      },

      reload() {
        store.menuResource.reload();
      }
    }
  })
);
