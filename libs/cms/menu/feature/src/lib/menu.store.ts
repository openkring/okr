import { computed, effect, inject, Injectable, Injector } from '@angular/core';
import { rxResource, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ENV } from '@okr/shared-config';
import { AppStore, withErrorState } from '@okr/shared-feature';
import { CategoryListModel, MenuItemModel } from '@okr/shared-models';
import { die, fill, nameMatches, safeStructuredClone, warn } from '@okr/shared-util-core';
import { AlertService, AppNavigationService, dismissOverlay, isInSplitPane, navigateByUrl, VersionCheckService } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { getRepoUrl, MENU_I18N_KEYS, resolveMenuLabelKey, resolveMenuUrl } from '@okr/cms-menu-util';

import { MenuItemsStore } from './menu-items.store';

import { AuthService } from '@okr/auth-data-access';
import { ActivityService } from '@okr/activity-data-access';
import type { MatrixChatService } from '@okr/chat-data-access';

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
    // Die Menüliste selbst ist mandantenweit identisch und liegt daher in EINEM root-Store,
    // nicht in dieser je Menüknoten neu erzeugten Instanz. Siehe menu-items.store.ts.
    menuItemsStore: inject(MenuItemsStore),
    featureStore: inject(FeatureStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    menuController: inject(MenuController),
    popoverController: inject(PopoverController),
    authService: inject(AuthService),
    activityService: inject(ActivityService),
    // Lazy: a static import of @okr/chat-data-access is the edge that dragged matrix-js-sdk
    // (198 KB transfer) before the dashboard's LCP (spec 1.49, F1). Same accessor as the cms
    // section stores.
    matrixChatService: ((injector: Injector) => {
      let p: Promise<MatrixChatService> | undefined;
      return () => (p ??= import('@okr/chat-data-access')
        .then(m => injector.get(m.MatrixChatService))
        // A failed chunk load must not poison the cache: drop it so the next call retries.
        .catch(e => { p = undefined; throw e; }));
    })(inject(Injector)),
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

        return from(store.matrixChatService()).pipe(
          switchMap(svc => svc.rooms),
          map(rooms => rooms.reduce((sum: number, r) => sum + r.unreadCount, 0))
        );
      }
    }),
  })),

  withComputed((store) => {
    return {
      menuItems: computed(() => store.menuItemsStore.menuItems()),
      menuItemsCount: computed(() => store.menuItemsStore.menuItems()?.length ?? 0),
      filteredMenuItems: computed(() => 
        store.menuItemsStore.menuItems()?.filter((menuItem: MenuItemModel) => 
          nameMatches(menuItem.index, store.searchTerm()) && 
          nameMatches(menuItem.action, store.selectedCategory())   
      )),
      // The single computed the recursive `Menu` component reads (`menu.ts`'s
      // `menuItem`), for every node in the tree including the tenant's root menu
      // (`main_<tenantId>`, resolved the same way from `okr-root.ts`). Filtering here
      // only drops entries from THIS node's `menuItems` (its children) — it never gates
      // resolution of the node itself, so the root lookup always still resolves.
      menu: computed(() => {
        // Nachschlagen in der geteilten Liste statt eigener Ressource. `MenuService.read(name)`
        // ist `findByKey(this.list(), name, 'name')`, abonniert also dieselbe mandantenweite
        // Abfrage und filtert clientseitig — je Menüknoten ein weiteres Abonnement. Nach dem
        // Herauslösen der Liste blieben davon am 2026-08-29 noch 86 übrig (von zuvor 170).
        const name = store.name();
        const item = name ? store.menuItemsStore.menuItems()?.find(i => i.name === name) : undefined;
        if (!item?.menuItems?.length) return item;
        const menuItems = item.menuItems.filter(store.isVisible);
        if (menuItems.length === item.menuItems.length) return item;
        return { ...item, menuItems };
      }),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      isMenuLoading: computed(() => store.menuItemsStore.isLoading()),
      isLoading: computed(() => store.menuItemsStore.isLoading()),
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
        store.menuItemsStore.reload();
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
            store.menuItemsStore.reload();
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
          store.menuItemsStore.reload();
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
                const matrix = await store.matrixChatService();
                matrix.toggleRoomList();
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

      /**
       * Fire `ui.menuCalled` for a menu item whose action is 'workflow'.
       *
       * `sourceName` is deliberately NOT sent: the callable reads the name from the menuItem
       * document. Sending it would let any signed-in client fire any rule of its own tenant by
       * inventing a name in the payload — the one security-relevant requirement of the spec.
       *
       * Errors are logged, never thrown: a failed trigger must not break navigation, and the
       * cooldown path does not throw at all (it returns { skipped: 'cooldown' }).
       */
      async emitUiEvent(menuItem: MenuItemModel): Promise<void> {
        if (!menuItem.okey) return;
        try {
          const { getFunctions, httpsCallable } = await import('firebase/functions');
          const { getApp } = await import('firebase/app');
          const fn = httpsCallable<{ tenantId: string; kind: string; sourceKey: string; linkKey: string }, unknown>(
            getFunctions(getApp(), 'europe-west6'), 'emitUiEvent',
          );
          await fn({
            tenantId: store.appStore.tenantId(),
            kind: 'menu',
            sourceKey: menuItem.okey,
            linkKey: menuItem.url ?? '',
          });
        } catch (ex) {
          warn('MenuStore.emitUiEvent: ' + ex);
        }
      },

      async selectMenuItem(router: Router, menuItem: MenuItemModel): Promise<void> {
        switch (menuItem.action) {
          case 'browse': {
            // The url may carry a dynamic token (e.g. '@REPO_URL@/commits/main/') so the menu
            // document does not hardcode data that already lives in app-config.
            const config = store.appStore.appConfig();
            const url = resolveMenuUrl(menuItem.url, {
              version: store.versionService.getCurrentVersion(),
              repoUrl: getRepoUrl(config.gitOrg, config.gitRepo),
            });
            await Browser.open({ url, windowName: getTarget(menuItem) });
            break;
          }
          case 'navigate':
            await navigateByUrl(router, menuItem.url, menuItem.data);
            break;
          case 'call':
          case 'toggle': // like 'call' — the hosting feature flips the state in its onPopoverDismiss handler
          case 'workflow': // like 'call' at the dispatch level; the event fires AFTER the dismissal
            // ion-popover's own dismissOnSelect can win this race and close first; the controller then
            // rejects with 'overlay does not exist'. Unawaited it escaped select()'s try/catch (SCS-5G).
            await dismissOverlay(store.popoverController, menuItem.url);
            // Decision O3 (spec 2026-08-29 §3): a call item opts into a workflow trigger by BEING
            // action 'workflow', not by carrying a marker. So every existing 'call' item is
            // untouched by construction — enforced by the data model, not by a convention — and
            // the intent is visible both in the menu editor and in this switch.
            if (menuItem.action === 'workflow') await this.emitUiEvent(menuItem);
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
  }),
  // Ein Ladefehler der geteilten Menüliste wird hier in den Fehlerzustand dieses Knotens
  // gespiegelt, damit die Oberfläche dieselbe Meldung zeigt wie vor der Aufteilung.
  withHooks({
    onInit(store) {
      effect(() => {
        if (store.menuItemsStore.hasLoadError()) {
          store.setError(store.i18n.error_load());
        }
      });
    },
  }),
);


@Injectable({
  providedIn: 'root'
})
export class MenuStore extends _MenuStore {
  constructor() {
    super();
  }
}