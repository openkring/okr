import { computed, inject, Injectable, Signal } from '@angular/core';
import { rxResource, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, MenuItemModel, TaskCollection, TaskModel } from '@bk2/shared-models';
import { die, getSystemQuery, nameMatches, safeStructuredClone, warn } from '@bk2/shared-util-core';
import { AppNavigationService, isInSplitPane, navigateByUrl, VersionCheckService } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

const MENU_I18N_KEYS = {
  menus:                          PFX + 'menus',
  submenus:                       PFX + 'submenus',
  empty:                          PFX + 'empty',
  link:                           PFX + 'link',
  action:                         PFX + 'action',
  as_title:                       '@actionsheet.title',
  edit:                           PFX + 'edit',
  view:                           PFX + 'view',
  create:                         PFX + 'create',
  delete:                         PFX + 'delete',
  add_submenu:                    PFX + 'add.submenu',

  menu_main_aoc_title:            PFX + 'menu.main.aoc.title',

  description:                    PFX + 'description.menu',
  description_label:              PFX + 'description.label',
  description_placeholder:        PFX + 'description.placeholder',
  icon_label:                     PFX + 'icon.label',
  icon_placeholder:               PFX + 'icon.placeholder',
  icon_helper:                    PFX + 'icon.helper',
  name_label:                     '@name',
  name_placeholder:               PFX + 'name.placeholder',
  name_helper:                    PFX + 'name.helper',
  label_label:                    PFX + 'label.label',
  label_placeholder:              PFX + 'label.placeholder',
  label_helper:                   PFX + 'label.helper',
  url_placeholder:                PFX + 'url.placeholder',
  url_helper:                     PFX + 'url.helper',
  url_label:                      PFX + 'url.label',
  category_plural:                PFX + 'category.plural',
  responsibility_export_raw:      PFX + 'responsibility.export.raw',
  content_section_plural:         PFX + 'content.section.plural',
  cancel:                         '@cancel',
  ok:                             '@ok',
  save:                           '@save.label',
} satisfies Record<string, string>;

export type MenuI18n = { [K in keyof typeof MENU_I18N_KEYS]: Signal<string> };

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
    i18nService: inject(I18nService),
    versionService: inject(VersionCheckService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(MENU_I18N_KEYS),
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

  withComputed((store) => {
    return {
      menuItems: computed(() => store.menuItemsResource.value()),
      menuItemsCount: computed(() => store.menuItemsResource.value()?.length ?? 0),
      filteredMenuItems: computed(() => 
        store.menuItemsResource.value()?.filter((menuItem: MenuItemModel) => 
          nameMatches(menuItem.index, store.searchTerm()) && 
          nameMatches(menuItem.action, store.selectedCategory())   
      )),
      menu: computed(() => store.menuResource.value() ?? undefined),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      isMenuLoading: computed(() => store.menuResource.isLoading()),
      isLoading: computed(() => store.menuItemsResource.isLoading() || store.menuResource.isLoading()),
      notificationCount: computed(() => store.notificationCountResource.value() ?? 0),
    };
  }),

  withProps((store) => ({
    translatedMenuLabel: toSignal(
      toObservable(computed(() => {
        const menuLabel = store.menu()?.label ?? '';
        if (menuLabel.includes('@VERSION@')) {
          return menuLabel.replace('@VERSION@', 'v' + store.versionService.getCurrentVersion());
        }
        if (menuLabel.startsWith('@')) {
          return PFX + menuLabel.substring(1);
        }
        return menuLabel;
      })).pipe(switchMap(key => store.i18nService.translate(key))),
      { initialValue: '' }
    ),
  })),

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
            readOnly,
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
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.edit();
        } else {
          return store.i18n.create();
        }
      },
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