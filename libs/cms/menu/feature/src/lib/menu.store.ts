import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, MenuItemModel, TaskCollection, TaskModel } from '@bk2/shared-models';
import { debugListLoaded, die, getSystemQuery, nameMatches, safeStructuredClone, warn } from '@bk2/shared-util-core';
import { AppNavigationService, isInSplitPane, navigateByUrl } from '@bk2/shared-util-angular';

import { AuthService } from '@bk2/auth-data-access';
import { ActivityService } from '@bk2/activity-data-access';
import { MatrixChatService } from '@bk2/chat-data-access';

import { MenuService } from '@bk2/cms-menu-data-access';
import { getTarget, isMenuItem } from '@bk2/cms-menu-util';

import { MenuModal } from './menu.modal';

export type MenuState = {
  searchTerm: string;
  selectedCategory: string;
  name: string;
};

export const initialState: MenuState = {
  searchTerm: '',
  selectedCategory: 'all',
  name: '',
};

export const _MenuStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    menuService: inject(MenuService),
    env: inject(ENV),
    modalController: inject(ModalController),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    menuController: inject(MenuController),
    popoverController: inject(PopoverController),
    authService: inject(AuthService),
    activityService: inject(ActivityService),
    matrixChatService: inject(MatrixChatService),
  })),
  withProps((store) => ({
    menuItemsResource: rxResource({
      stream: () => {
        return store.menuService.list();
      }
    }),
    menuResource: rxResource({
      params: () => ({
        name: store.name()
      }),
      stream: ({ params }) => {
        return store.menuService.read(params.name);
      }
    }),
    notificationCountResource: rxResource({
      params: () => ({
        name: store.name(),
        personKey: store.appStore.currentUser()?.personKey,
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }): Observable<number> => {
        const { name, personKey, tenantId } = params;
        // Only activate real subscriptions for the dashboard menu item.
        // All other menu instances return 0 immediately — no Firestore or Matrix connections.
        if (name !== 'dashboard' || !personKey) return of(0);

        const chatCount$ = store.matrixChatService.rooms.pipe(
          map(rooms => rooms.reduce((sum: number, r) => sum + r.unreadCount, 0))
        );

        const taskQuery = getSystemQuery(tenantId);
        taskQuery.push({ key: 'completionDate', operator: '==', value: '' });
        const taskCount$ = store.appStore.firestoreService.searchData<TaskModel>(TaskCollection, taskQuery, 'dueDate', 'asc').pipe(
          map(tasks => tasks.filter(t => t.assignee?.key === personKey || t.author?.key === personKey).length)
        );

        return combineLatest([chatCount$, taskCount$]).pipe(
          map(([chat, tasks]) => chat + tasks)
        );
      }
    }),
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
      menu: computed(() => state.menuResource.value() ?? undefined),
      currentUser: computed(() => state.appStore.currentUser()),
      isMenuLoading: computed(() => state.menuResource.isLoading()),
      isLoading: computed(() => state.menuItemsResource.isLoading() || state.menuResource.isLoading()),
      notificationCount: computed(() => state.notificationCountResource.value() ?? 0),
    };
  }),

  withMethods((store) => {
    return {
      reload() {
        store.menuResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      /**
       * Updates the menu name which triggers the loading of the menu.
       * @param name the key of the menu
       */
      setMenuName(name: string) {
        patchState(store, { name });
      },

      /******************************** setters (filter) ******************************************* */
      getTags(): string {
        return store.appStore.getTags('menuitem');
      },

      getRoles(): CategoryListModel {
        return store.appStore.getCategory('roles');
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('menu_action');
      },
      
      /******************************* actions *************************************** */
      async delete(menuItem?: MenuItemModel, readOnly = true): Promise<void> {
        if (!readOnly && menuItem) {
          await store.menuService.delete(menuItem);
          store.menuItemsResource.reload();
        }
      },
      
      async edit(menuItem?: MenuItemModel, readOnly = true): Promise<void> {
        // we need to clone the menuItem to avoid changing the original object (NG0100: ExpressionChangeAfterItHasBeenCheckedError)
        const _menuItem = safeStructuredClone(menuItem) ?? new MenuItemModel(store.env.tenantId);
        const modal = await store.modalController.create({
          component: MenuModal,
          componentProps: {
            menuItem: _menuItem,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            roles: this.getRoles(),
            types: this.getTypes(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isMenuItem(data, store.env.tenantId)) {
            await ((!menuItem) ? store.menuService.create(data, store.currentUser()) : store.menuService.update(data));
            store.menuItemsResource.reload();
          }
        }
      },

      async select(menuItem: MenuItemModel): Promise<void> {
        try {
          store.appNavigationService.resetLinkHistory(menuItem.url);
          switch(menuItem.url) {
            case '/auth/login':
              await this.login();
              break;
            case '/auth/logout':
              await this.logout();
              break;
            default: {
              const currentPath = store.router.url.split('?')[0];
              if (menuItem.url === currentPath && menuItem.url.includes('/chat/')) {
                // Already on the chat page: toggle the room list instead of navigating
                store.matrixChatService.toggleRoomList();
              } else {
                await this.selectMenuItem(store.router, menuItem);
              }
            }
          }
          if (!isInSplitPane()) store.menuController.close('main');
        }
        catch(ex) {
          warn('MenuStore.select: ' + ex);
        }
      },

      async login(): Promise<void> {
        const menuItem = store.menu();
        if (menuItem) {
          await navigateByUrl(store.router, menuItem.url, menuItem.data);
        } else {
          warn('MenuStore.login: MenuItem missing');
        }
      },

      async logout(): Promise<void> {
        const email = store.appStore.loginEmail() ?? '';
        await store.activityService.logAuth('logout', email); // user still authenticated here; errors are swallowed
        const loggedOut = await store.authService.logout();
        if (loggedOut) await navigateByUrl(store.router, '/auth/login', store.menu()?.data);
      },

      async selectMenuItem(router: Router, menuItem: MenuItemModel): Promise<void> {
        switch (menuItem.action) {
          case 'browse':
            await Browser.open({ url: menuItem.url, windowName: getTarget(menuItem) });
            break;
          case 'navigate':
            await navigateByUrl(router, menuItem.url, menuItem.data);
            break;
          case 'call':
            store.popoverController.dismiss(menuItem.url);
            break;
          default:
            die('MenuStore.selectMenuItem: invalid MenuAction=' + menuItem.action);
        }
      }
    }
  })
);


@Injectable({
  providedIn: 'root'
})
export class MenuStore extends _MenuStore {
  constructor() {
    super();
  }
}