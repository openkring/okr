import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { MenuItemModel } from '@bk2/shared-models';
import { debugListLoaded, nameMatches } from '@bk2/shared-util-core';

import { MenuService } from '@bk2/cms-menu-data-access';
import { isMenuItem } from '@bk2/cms-menu-util';

import { MenuItemModalComponent } from './menu.modal';

export type MenuItemList = {
  searchTerm: string;
  selectedCategory: string;
};

export const initialState: MenuItemList = {
  searchTerm: '',
  selectedCategory: 'all',
};

export const MenuItemListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    menuItemService: inject(MenuService),
    env: inject(ENV),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    menuItemsResource: rxResource({
      stream: () => {
        const menuItems$ = store.menuItemService.list();
        debugListLoaded<MenuItemModel>('menuItem', menuItems$, store.appStore.currentUser());
        return menuItems$;
      }
    })
  })),

  withComputed((state) => {
    return {
      menuItems: computed(() => state.menuItemsResource.value()),
      menuItemsCount: computed(() => state.menuItemsResource.value()?.length ?? 0),
      filteredMenuItems: computed(() => 
        state.menuItemsResource.value()?.filter((menuItem: MenuItemModel) => 
          nameMatches(menuItem.index, state.searchTerm()) && 
          nameMatches(menuItem.action, state.selectedCategory())   
      )),
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.menuItemsResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      async delete(menuItem: MenuItemModel): Promise<void> {
        await store.menuItemService.delete(menuItem);
        store.menuItemsResource.reload();
      },
      
      async edit(menuItem?: MenuItemModel): Promise<void> {
        // we need to clone the menuItem to avoid changing the original object (NG0100: ExpressionChangeAfterItHasBeenCheckedError)
        const _menuItem = structuredClone(menuItem) ?? new MenuItemModel(store.env.tenantId);
        const _modal = await store.modalController.create({
          component: MenuItemModalComponent,
          componentProps: {
            menuItem: _menuItem,
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          if (isMenuItem(data, store.env.tenantId)) {
            await ((!menuItem) ? store.menuItemService.create(data, store.currentUser()) : store.menuItemService.update(data));
            store.menuItemsResource.reload();
          }
        }
      }
    }
  })
);

