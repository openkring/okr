import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { mockCollection, mockError } from '@okr/shared-feature/testing';
import { I18nService } from '@okr/shared-i18n';
import { AlertService, AppNavigationService, VersionCheckService } from '@okr/shared-util-angular';
import { AuthService } from '@okr/auth-data-access';
import { ActivityService } from '@okr/activity-data-access';
import { MatrixChatService } from '@okr/chat-data-access';
import { MenuService } from '@okr/cms-menu-data-access';
import { FeatureStore } from '@okr/tenant-feature';

import { MenuStore } from './menu.store';

const tenantId = 'p13';
const i18nProxy = new Proxy({}, { get: () => () => 'x' });

function appStoreMock() {
  return {
    currentUser: signal(undefined),
    tenantId: signal(tenantId),
    loginEmail: signal(undefined),
    env: { tenantId },
    firestoreService: { searchData: vi.fn(() => of([])) },
    getTags: vi.fn(() => ''),
    getCategory: vi.fn(() => ({ name: 'c', i18nBase: '', translateItems: false, items: [] }))
  };
}

/**
 * `menuDoc` is the document `store.menu()` should resolve to. It is appended to the list because
 * the store now looks the node up in the SHARED menu list (see `MenuItemsStore`) instead of
 * subscribing to `MenuService.read(name)` per node — `read` was itself
 * `findByKey(this.list(), name, 'name')`, i.e. a second subscription to the same query. The doc
 * therefore needs a `name` matching the `setMenuName(...)` of the test.
 */
function menuServiceMock(list: unknown[] = [], menuDoc?: unknown) {
  return {
    list: vi.fn(() => mockCollection(menuDoc ? [...list, menuDoc] : list)),
    read: vi.fn(() => of(menuDoc)),
    create: vi.fn().mockResolvedValue('new-id'),
    update: vi.fn().mockResolvedValue('updated-id'),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * `FeatureStore.effective` is a `Set<string>` of block ids offered to the tenant right now.
 * A plain `signal()` stands in for the real computed — `MenuStore` only ever calls it, never
 * cares that it isn't derived from rollouts/app-config.
 */
function featureStoreMock(effectiveIds: string[] = []) {
  return { effective: signal(new Set(effectiveIds)) };
}

function makeStore(
  menuService = menuServiceMock(),
  featureStore = featureStoreMock(),
  alertService: { confirm: () => Promise<boolean> } = { confirm: () => Promise.resolve(true) },
): MenuStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MenuStore,
      { provide: AppStore, useValue: appStoreMock() },
      { provide: MenuService, useValue: menuService },
      { provide: FeatureStore, useValue: featureStore },
      { provide: ENV, useValue: { tenantId } },
      { provide: ModalController, useValue: {} },
      { provide: MenuController, useValue: {} },
      { provide: PopoverController, useValue: {} },
      { provide: Router, useValue: { url: '/' } },
      { provide: AppNavigationService, useValue: {} },
      { provide: AuthService, useValue: {} },
      { provide: ActivityService, useValue: {} },
      { provide: MatrixChatService, useValue: { rooms: of([]) } },
      { provide: VersionCheckService, useValue: { getCurrentVersion: () => '1.0.0' } },
      { provide: I18nService, useValue: { translateAll: () => i18nProxy, translate: () => of('') } },
      // The store injects AlertService for the fork-ownership guard (`confirmFork`). The real
      // one pulls in TranslocoService, which this TestBed does not configure — stub it.
      // `confirm` defaults to true so the non-fork paths under test behave as before.
      { provide: AlertService, useValue: alertService }
    ]
  });
  return TestBed.inject(MenuStore);
}

describe('MenuStore', () => {
  let store: MenuStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('has sensible initial filter state', () => {
    expect(store.searchTerm()).toBe('');
    expect(store.selectedCategory()).toBe('all');
    expect(store.name()).toBe('');
  });

  it('setters update the filter state', () => {
    store.setSearchTerm('home');
    store.setSelectedCategory('navigate');
    store.setMenuName('main');
    expect(store.searchTerm()).toBe('home');
    expect(store.selectedCategory()).toBe('navigate');
    expect(store.name()).toBe('main');
  });

  it('filteredMenuItems filters the loaded items by search term', async () => {
    const items = [
      { okey: '1', index: 'home', action: 'navigate' },
      { okey: '2', index: 'about', action: 'navigate' }
    ];
    store = makeStore(menuServiceMock(items));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.menuItemsCount()).toBe(2);
    store.setSearchTerm('home');
    expect(store.filteredMenuItems()?.map((m) => m.okey)).toEqual(['1']);
  });

  it('sets error state when the menu-items stream fails', async () => {
    store = makeStore({ ...menuServiceMock(), list: vi.fn(() => mockError('load failed')) });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.isError()).toBe(true);
  });

  it('resolves the node from the shared list, without a per-node MenuService.read subscription', async () => {
    // Regression guard for the 2026-08-29 measurement: MenuService.read(name) is
    // findByKey(this.list(), ...), so a per-node resource over it re-subscribed the whole
    // tenant-wide menu query once per <bk-menu>. 86 subscriptions were left after the list
    // itself had been hoisted out. Resolving from the shared list removes them.
    const menuService = menuServiceMock([], { okey: 'main', name: 'main', menuItems: [] });
    store = makeStore(menuService);
    store.setMenuName('main');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(store.menu()?.name).toBe('main');
    expect(menuService.read).not.toHaveBeenCalled();
  });

  // `aoc-storage` is a real key from FEATURE_BLOCKS (@okr/tenant-util) — nested under the
  // `aoc` block's menu, owned by block id 'aoc'. `my-custom-link` is not declared by any
  // block, so it is a stand-in for a tenant-authored menu entry.
  describe('feature-block visibility filter (D-BB-8)', () => {
    it('renders a child menu item whose owning block is effective', async () => {
      store = makeStore(
        menuServiceMock([], { okey: 'aoc-menu', name: 'aoc-menu', menuItems: ['aoc-storage', 'my-custom-link'] }),
        featureStoreMock(['aoc'])
      );
      store.setMenuName('aoc-menu');
      await TestBed.inject(ApplicationRef).whenStable();
      expect(store.menu()?.menuItems).toEqual(['aoc-storage', 'my-custom-link']);
    });

    it('drops a child menu item whose owning block is not effective, without dropping the node itself', async () => {
      store = makeStore(
        menuServiceMock([], { okey: 'aoc-menu', name: 'aoc-menu', menuItems: ['aoc-storage', 'my-custom-link'] }),
        featureStoreMock([]) // 'aoc' not effective
      );
      store.setMenuName('aoc-menu');
      await TestBed.inject(ApplicationRef).whenStable();
      // The node itself (whose own key is also owned by the now-off 'aoc' block) still
      // resolves — only its children are filtered. Never gate resolution on the node's own key.
      expect(store.menu()).toBeDefined();
      expect(store.menu()?.menuItems).toEqual(['my-custom-link']);
    });

    it('always renders a tenant-authored child that no block declares', async () => {
      store = makeStore(
        menuServiceMock([], { okey: 'main_p13', name: 'main_p13', menuItems: ['my-custom-link'] }),
        featureStoreMock([]) // nothing effective
      );
      store.setMenuName('main_p13');
      await TestBed.inject(ApplicationRef).whenStable();
      expect(store.menu()?.menuItems).toEqual(['my-custom-link']);
    });

    // Regression, task 12 review round 3: 'user-all'/'priv-register'/'priv-audit' are
    // children of the SHARED 'aoc-menu' parent, but they are owned by 'user'/'security'
    // (both core: true, always effective) — NOT by 'aoc' (bundle 'special', togglable).
    // `blockOfMenuKey` used to return only the FIRST declaring block in `FEATURE_BLOCKS`
    // order ('aoc'), so switching 'aoc' off alone hid these two always-on blocks' own menu
    // entries too. Fixed via `blockOwnersOfMenuKey` (multi-owner aware): visibility is now
    // "ANY declaring block is effective", not just the first.
    it('keeps a child owned by a DIFFERENT, still-effective co-declarer of a shared parent, even when the parent\'s first declarer is switched off', async () => {
      store = makeStore(
        menuServiceMock([], {
          okey: 'aoc-menu', name: 'aoc-menu',
          menuItems: ['user-all', 'priv-register', 'priv-audit', 'aoc-admin'],
        }),
        featureStoreMock(['user', 'security']) // 'aoc' deliberately NOT effective
      );
      store.setMenuName('aoc-menu');
      await TestBed.inject(ApplicationRef).whenStable();
      // 'aoc-admin' (owned only by the now-off 'aoc') is dropped; the three entries owned
      // by 'user'/'security' (both still effective) survive.
      expect(store.menu()?.menuItems).toEqual(['user-all', 'priv-register', 'priv-audit']);
    });
  });
  /**
   * The fork guard (`confirmFork`). `MenuService.update()` copy-on-writes a menu doc shared with
   * other tenants and detaches this one from the shared original — legitimate, but it used to be
   * silent, and afterwards catalogue structural fixes never reach the copy. These pin the WIRING:
   * that the confirmation is asked only when a fork will really happen, and that declining it
   * actually stops the write. The decision logic itself is covered by `menu-ownership.util.spec`.
   */
  describe('fork guard on save', () => {
    // 'aoc-menu' is catalogue-owned AND shared with another tenant → update() would fork it.
    const sharedCatalogueDoc = { okey: 'aoc-menu', name: 'aoc-menu', tenants: [tenantId, 'scs'] };
    // A hand-written row no block declares, owned by this tenant alone → never forks.
    const ownDoc = { okey: 'my-own-row', name: 'my-own-row', tenants: [tenantId] };

    function editWith(doc: object, confirmed: boolean) {
      const menuService = menuServiceMock();
      const confirm = vi.fn().mockResolvedValue(confirmed);
      const store = makeStore(menuService, featureStoreMock(), { confirm });
      // `edit()` opens a modal; drive the store's guard directly instead — it is the unit that
      // decides, and stubbing ModalController's full lifecycle would test Ionic, not this.
      return { store, menuService, confirm, doc };
    }

    it('asks before forking a shared catalogue document', async () => {
      const { store, confirm } = editWith(sharedCatalogueDoc, true);
      const mayProceed = await store.confirmFork(sharedCatalogueDoc as never);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mayProceed).toBe(true);
    });

    it('stops the save when the admin declines the fork', async () => {
      const { store, confirm } = editWith(sharedCatalogueDoc, false);
      const mayProceed = await store.confirmFork(sharedCatalogueDoc as never);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mayProceed).toBe(false);
    });

    it('never interrupts an edit that will not fork', async () => {
      const { store, confirm } = editWith(ownDoc, true);
      const mayProceed = await store.confirmFork(ownDoc as never);

      expect(confirm).not.toHaveBeenCalled();
      expect(mayProceed).toBe(true);
    });

    // A catalogue-owned doc this tenant already owns ALONE is not shared, so there is nothing to
    // detach — `MenuService.update()` writes it in place and the guard must stay quiet.
    it('never interrupts an edit of a catalogue doc this tenant owns alone', async () => {
      const soleOwner = { okey: 'aoc-menu_p13', name: 'aoc-menu', tenants: [tenantId] };
      const { store, confirm } = editWith(soleOwner, true);
      const mayProceed = await store.confirmFork(soleOwner as never);

      expect(confirm).not.toHaveBeenCalled();
      expect(mayProceed).toBe(true);
    });
  });
});
