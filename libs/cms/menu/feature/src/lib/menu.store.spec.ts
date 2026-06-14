import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { mockCollection, mockError } from '@bk2/shared-feature/testing';
import { I18nService } from '@bk2/shared-i18n';
import { AppNavigationService, VersionCheckService } from '@bk2/shared-util-angular';
import { AuthService } from '@bk2/auth-data-access';
import { ActivityService } from '@bk2/activity-data-access';
import { MatrixChatService } from '@bk2/chat-data-access';
import { MenuService } from '@bk2/cms-menu-data-access';

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

function menuServiceMock(list: unknown[] = []) {
  return {
    list: vi.fn(() => mockCollection(list)),
    read: vi.fn(() => of(undefined)),
    create: vi.fn().mockResolvedValue('new-id'),
    update: vi.fn().mockResolvedValue('updated-id'),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

function makeStore(menuService = menuServiceMock()): MenuStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MenuStore,
      { provide: AppStore, useValue: appStoreMock() },
      { provide: MenuService, useValue: menuService },
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
      { bkey: '1', index: 'home', action: 'navigate' },
      { bkey: '2', index: 'about', action: 'navigate' }
    ];
    store = makeStore(menuServiceMock(items));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.menuItemsCount()).toBe(2);
    store.setSearchTerm('home');
    expect(store.filteredMenuItems()?.map((m) => m.bkey)).toEqual(['1']);
  });

  it('sets error state when the menu-items stream fails', async () => {
    store = makeStore({ ...menuServiceMock(), list: vi.fn(() => mockError('load failed')) });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.isError()).toBe(true);
  });
});
