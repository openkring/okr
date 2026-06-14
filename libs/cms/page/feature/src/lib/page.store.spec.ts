import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { mockCollection, mockError } from '@bk2/shared-feature/testing';
import { I18nService } from '@bk2/shared-i18n';
import { PageService } from '@bk2/cms-page-data-access';
import { SectionService } from '@bk2/cms-section-data-access';

import { PageStore } from './page.store';

const i18nProxy = new Proxy({}, { get: () => () => 'x' });

function appStoreMock() {
  return {
    tenantId: signal('p13'),
    currentUser: signal(undefined),
    showDebugInfo: signal(false),
    services: { imgixBaseUrl: signal('https://imgix.example') },
    getCategory: vi.fn(() => ({ name: 'c', i18nBase: '', translateItems: false, items: [] })),
    getTags: vi.fn(() => ''),
    appConfig: signal({})
  };
}

function pageServiceMock(list: unknown[] = []) {
  return {
    list: vi.fn(() => mockCollection(list)),
    read: vi.fn(() => of(undefined)),
    create: vi.fn().mockResolvedValue('new-id'),
    update: vi.fn().mockResolvedValue('updated-id'),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

function makeStore(pageService = pageServiceMock()): PageStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PageStore,
      { provide: AppStore, useValue: appStoreMock() },
      { provide: PageService, useValue: pageService },
      { provide: SectionService, useValue: { read: vi.fn(() => of(undefined)), searchByKeys: vi.fn(() => of([])) } },
      { provide: ModalController, useValue: {} },
      { provide: AlertController, useValue: {} },
      { provide: Router, useValue: {} },
      { provide: I18nService, useValue: { translateAll: () => i18nProxy } }
    ]
  });
  return TestBed.inject(PageStore);
}

describe('PageStore', () => {
  let store: PageStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('has sensible initial filter state', () => {
    expect(store.searchTerm()).toBe('');
    expect(store.selectedTag()).toBe('');
    expect(store.selectedType()).toBe('all');
    expect(store.selectedState()).toBe('all');
    expect(store.pageId()).toBe('');
  });

  it('setters update the filter state', () => {
    store.setSearchTerm('home');
    store.setSelectedType('content');
    store.setSelectedState('published');
    store.setSelectedTag('news');
    expect(store.searchTerm()).toBe('home');
    expect(store.selectedType()).toBe('content');
    expect(store.selectedState()).toBe('published');
    expect(store.selectedTag()).toBe('news');
  });

  it('setPageId updates the pageId', () => {
    store.setPageId('p42');
    expect(store.pageId()).toBe('p42');
  });

  it('filteredPages filters the loaded pages by search term', async () => {
    const pages = [
      { bkey: '1', index: 'home', name: 'Home', type: 'content', state: 'published', tags: '', sections: [] },
      { bkey: '2', index: 'about', name: 'About', type: 'content', state: 'published', tags: '', sections: [] }
    ];
    store = makeStore(pageServiceMock(pages));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.pagesCount()).toBe(2);
    store.setSearchTerm('home');
    expect(store.filteredPages()?.map((p) => p.name)).toEqual(['Home']);
  });

  it('starts without an error and exposes error state (withErrorState)', () => {
    expect(store.isError()).toBe(false);
    expect(store.errorMessage()).toBeUndefined();
    store.setError('save failed');
    expect(store.isError()).toBe(true);
    expect(store.errorMessage()).toBe('save failed');
    store.clearError();
    expect(store.isError()).toBe(false);
  });

  it('sets error state when the pages stream fails', async () => {
    store = makeStore({ ...pageServiceMock(), list: vi.fn(() => mockError('load failed')) });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.isError()).toBe(true);
  });
});
