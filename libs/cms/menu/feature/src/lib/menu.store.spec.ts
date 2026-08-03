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
import { AppNavigationService, VersionCheckService } from '@okr/shared-util-angular';
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

function menuServiceMock(list: unknown[] = [], menuDoc?: unknown) {
  return {
    list: vi.fn(() => mockCollection(list)),
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

function makeStore(menuService = menuServiceMock(), featureStore = featureStoreMock()): MenuStore {
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
      { provide: I18nService, useValue: { translateAll: () => i18nProxy, translate: () => of('') } }
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

  // `aoc-storage` is a real key from FEATURE_BLOCKS (@okr/tenant-util) — nested under the
  // `aoc` block's menu, owned by block id 'aoc'. `my-custom-link` is not declared by any
  // block, so it is a stand-in for a tenant-authored menu entry.
  describe('feature-block visibility filter (D-BB-8)', () => {
    it('renders a child menu item whose owning block is effective', async () => {
      store = makeStore(
        menuServiceMock([], { menuItems: ['aoc-storage', 'my-custom-link'] }),
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
        menuServiceMock([], { menuItems: ['my-custom-link'] }),
        featureStoreMock([]) // nothing effective
      );
      store.setMenuName('main_p13');
      await TestBed.inject(ApplicationRef).whenStable();
      expect(store.menu()?.menuItems).toEqual(['my-custom-link']);
    });
  });
});
