import { computed, inject, Injectable, Signal } from '@angular/core';
import { rxResource, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { ENV } from '@okr/shared-config';
import { AppStore, withErrorState } from '@okr/shared-feature';
import { CategoryListModel, MenuItemModel } from '@okr/shared-models';
import { debugData, die, fill, nameMatches, safeStructuredClone, warn } from '@okr/shared-util-core';
import { AlertService, AppNavigationService, dismissOverlay, isInSplitPane, navigateByUrl, VersionCheckService } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { MENU_I18N_KEYS, resolveMenuLabelKey } from '@okr/cms-menu-util';

import { AuthService } from '@okr/auth-data-access';
import { ActivityService } from '@okr/activity-data-access';
import { MatrixChatService } from '@okr/chat-data-access';

import { MenuService } from '@okr/cms-menu-data-access';
import { getTarget, isMenuItem } from '@okr/cms-menu-util';

import { FeatureStore } from '@okr/tenant-feature';
import { blockOwnersOfMenuKey, classifyMenuOwnership, FEATURE_BLOCKS } from '@okr/tenant-util';


export type MenuState = {
  searchTerm: string;
  selectedCategory: string;
  name: string;
  toggleActive: boolean; // action 'toggle' only: whether the toggled state is currently active (drives icon/label)
};

export const initialState: MenuState = {
  searchTerm: '',
  selectedCategory: 'all',
  name: '',
  toggleActive: false,
};

export const _MenuStore = signalStore(
  withState(initialState),
  withErrorState(),
  withProps(() => ({
    appStore: inject(AppStore),
    menuService: inject(MenuService),
    featureStore: inject(FeatureStore),
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
    alertService: inject(AlertService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(MENU_I18N_KEYS),
    // A menu doc is rendered as a child only when its owning feature block is effective
    // for this tenant. `tenants[]` (query-level) still decides readability; enablement
    // decides visibility on top of that (D-BB-8). `blockOwnersOfMenuKey` returns every
    // block that declares this key — a "shared parent" key like `aoc-menu` is declared by
    // `aoc` (togglable) AND by `user`/`security` (always `core: true`), so visibility must
    // be "ANY owner effective", not just the first — else disabling `aoc` alone would also
    // hide `user`/`security`'s own, still-effective menu entries (task 12 review round 3).
    // `[]` (no owners) means a tenant-authored menu entry — those always render.
    isVisible: (key: string): boolean => {
      const owners = blockOwnersOfMenuKey(FEATURE_BLOCKS, key);
      return owners.length === 0 || owners.some(id => store.featureStore.effective().has(id));
    },
  })),
  withProps((store) => ({
    menuItemsResource: rxResource({
      stream: () => {
        return store.menuService.list().pipe(
          catchError(error => {
            debugData('MenuStore.menuItemsResource: stream error', error, store.appStore.currentUser());
            store.setError(store.i18n.error_load());
            return of([] as MenuItemModel[]);
          })
        );
      }
    }),
    menuResource: rxResource({
      params: () => ({
        name: store.name()
      }),
      stream: ({ params }) => {
        return store.menuService.read(params.name).pipe(
          catchError(error => {
            debugData('MenuStore.menuResource: stream error', error, store.appStore.currentUser());
            store.setError(store.i18n.error_load());
            return of(undefined);
          })
        );
      }
    }),
    // Chat half of the badge. The task half comes from AppStore.openTaskCount (see
    // notificationCount below) — the single source shared with the PWA app-icon badge,
    // so the two can no longer disagree about what counts as a notification.
    chatUnreadResource: rxResource({
      params: () => ({
        name: store.name(),
        personKey: store.appStore.currentUser()?.personKey,
      }),
      stream: ({ params }): Observable<number> => {
        const { name, personKey } = params;
        // Only activate a real subscription for the dashboard menu item.
        // All other menu instances return 0 immediately — no Matrix connection.
        if (name !== 'dashboard' || !personKey) return of(0);

        return store.matrixChatService.rooms.pipe(
          map(rooms => rooms.reduce((sum: number, r) => sum + r.unreadCount, 0))
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
      // The single computed the recursive `Menu` component reads (`menu.ts`'s
      // `menuItem`), for every node in the tree including the tenant's root menu
      // (`main_<tenantId>`, resolved the same way from `okr-root.ts`). Filtering here
      // only drops entries from THIS node's `menuItems` (its children) — it never gates
      // resolution of the node itself, so the root lookup always still resolves.
      menu: computed(() => {
        const item = store.menuResource.value() ?? undefined;
        if (!item?.menuItems?.length) return item;
        const menuItems = item.menuItems.filter(store.isVisible);
        if (menuItems.length === item.menuItems.length) return item;
        return { ...item, menuItems };
      }),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      isMenuLoading: computed(() => store.menuResource.isLoading()),
      isLoading: computed(() => store.menuItemsResource.isLoading() || store.menuResource.isLoading()),
      // Chat unread + open assigned tasks + unanswered invitations. The dashboard menu item is
      // the only one that subscribes to chat, so every other instance contributes 0 there; gate
      // the other halves on the same name so a non-dashboard menu never shows a badge either.
      notificationCount: computed(() =>
        (store.chatUnreadResource.value() ?? 0) +
        (store.name() === 'dashboard' ? store.appStore.openTaskCount() + store.appStore.openInvitationCount() : 0)),
    };
  }),

  withProps((store) => ({
    translatedMenuLabel: toSignal(
      toObservable(computed(() => {
        const item = store.menu();
        // toggle items show labelAlt while active; base label otherwise
        const useAlt = item?.action === 'toggle' && store.toggleActive();
        const menuLabel = (useAlt ? (item?.labelAlt ?? item?.label) : item?.label) ?? '';
        return resolveMenuLabelKey(menuLabel, { version: store.versionService.getCurrentVersion() });
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

      setToggleActive(toggleActive: boolean) {
        patchState(store, { toggleActive });
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
          store.clearError();
          try {
            await store.menuService.delete(menuItem);
            store.menuItemsResource.reload();
          } catch (error) {
            store.setError(store.i18n.error_delete());
            throw error;
          }
        }
      },
      
      async edit(menuItem?: MenuItemModel, readOnly = true): Promise<void> {
        // we need to clone the menuItem to avoid changing the original object (NG0100: ExpressionChangeAfterItHasBeenCheckedError)
        const _menuItem = safeStructuredClone(menuItem) ?? new MenuItemModel(store.env.tenantId);
        const { MenuModal } = await import('./menu.modal');
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
        if (role !== 'confirm' || !data || readOnly) return;
        if (!isMenuItem(data, store.env.tenantId)) return;

        const isUpdate = menuItem !== undefined;
        if (isUpdate && !await this.confirmFork(data)) return;

        store.clearError();
        try {
          await (isUpdate ? store.menuService.update(data) : store.menuService.create(data, store.currentUser()));
          store.menuItemsResource.reload();
        } catch (error) {
          store.setError(store.i18n.error_save());
          throw error;
        }
      },

      /**
       * GUARD — `MenuService.update()` copy-on-writes a menu document shared with other tenants
       * and detaches this tenant from the shared original (D-BB-8).
       *
       * Forking is a legitimate operation: it is how a tenant customises a catalogue-owned row.
       * But it used to happen SILENTLY, and its cost is invisible from the edit form — catalogue
       * structural fixes (`url`/`action`/`roleNeeded`) never reach the copy again, so the row
       * quietly stops tracking the catalogue and nothing says so until «Struktur übernehmen»
       * reports drift months later. Name the cost and the resulting doc id, then let the admin
       * decide; this deliberately does NOT block the edit.
       *
       * `classifyMenuOwnership` mirrors `update()`'s own fork condition rather than restating it,
       * so this can never warn about a fork that will not happen — or stay silent about one that
       * will.
       *
       * @returns true when the save may proceed (no fork, or the admin accepted it).
       */
      async confirmFork(data: MenuItemModel): Promise<boolean> {
        const ownership = classifyMenuOwnership(data, store.env.tenantId, FEATURE_BLOCKS);
        if (!ownership.willFork) return true;

        const message = fill(store.i18n.fork_confirm(), {
          name: data.name,
          forkKey: ownership.forkTargetKey ?? '',
          blocks: ownership.owners.join(', '),
        });
        return await store.alertService.confirm(message, true);
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
        await store.activityService.logAuth('logout', 'on menu: ' + email); // user still authenticated here; errors are swallowed
        const loggedOut = await store.authService.logout(store.currentUser());
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
          case 'toggle': // like 'call' — the hosting feature flips the state in its onPopoverDismiss handler
            // ion-popover's own dismissOnSelect can win this race and close first; the controller then
            // rejects with 'overlay does not exist'. Unawaited it escaped select()'s try/catch (SCS-5G).
            await dismissOverlay(store.popoverController, menuItem.url);
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