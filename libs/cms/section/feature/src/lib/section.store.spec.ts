import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { mockCollection, mockError } from '@bk2/shared-feature/testing';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { UploadService } from '@bk2/avatar-data-access';
import { MatrixChatService } from '@bk2/chat-data-access';
import { SectionService } from '@bk2/cms-section-data-access';

import { SectionStore } from './section.store';

const i18nProxy = new Proxy({}, { get: () => () => 'x' });

function appStoreMock() {
  return {
    tenantId: signal('p13'),
    currentUser: signal(undefined),
    showDebugInfo: signal(false),
    env: { services: { imgixBaseUrl: 'https://imgix.example' } },
    getCategory: vi.fn(() => ({ name: 'c', i18nBase: '', translateItems: false, items: [] })),
    getTags: vi.fn(() => '')
  };
}

function sectionServiceMock(list: unknown[] = []) {
  return {
    list: vi.fn(() => mockCollection(list)),
    read: vi.fn(() => of(undefined)),
    create: vi.fn().mockResolvedValue('new-id'),
    update: vi.fn().mockResolvedValue('updated-id'),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

function makeStore(sectionService = sectionServiceMock()): SectionStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SectionStore,
      { provide: AppStore, useValue: appStoreMock() },
      { provide: SectionService, useValue: sectionService },
      { provide: UploadService, useValue: {} },
      { provide: MatrixChatService, useValue: { isInitialized: false } },
      { provide: ModalController, useValue: {} },
      { provide: AlertController, useValue: {} },
      { provide: ToastController, useValue: {} },
      { provide: FirestoreService, useValue: {} },
      { provide: I18nService, useValue: { translateAll: () => i18nProxy } }
    ]
  });
  return TestBed.inject(SectionStore);
}

describe('SectionStore', () => {
  let store: SectionStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('has sensible initial filter state', () => {
    expect(store.searchTerm()).toBe('');
    expect(store.selSearchTerm()).toBe('');
    expect(store.selectedTag()).toBe('');
    expect(store.selectedCategory()).toBe('all');
    expect(store.selectedState()).toBe('all');
    expect(store.sectionId()).toBe('');
  });

  it('setters update the filter state', () => {
    store.setSearchTerm('hero');
    store.setSelectedCategory('article');
    store.setSelectedState('published');
    store.setSelectedTag('main');
    store.setSectionId('s42');
    expect(store.searchTerm()).toBe('hero');
    expect(store.selectedCategory()).toBe('article');
    expect(store.selectedState()).toBe('published');
    expect(store.selectedTag()).toBe('main');
    expect(store.sectionId()).toBe('s42');
  });

  it('filteredSections filters the loaded sections by search term', async () => {
    const sections = [
      { bkey: '1', index: 'hero', type: 'article', state: 'published', tags: '' },
      { bkey: '2', index: 'intro', type: 'article', state: 'published', tags: '' }
    ];
    store = makeStore(sectionServiceMock(sections));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.sectionsCount()).toBe(2);
    store.setSearchTerm('hero');
    expect(store.filteredSections()?.map((s) => s.bkey)).toEqual(['1']);
  });

  it('starts without an error and exposes error state (withErrorState)', () => {
    expect(store.isError()).toBe(false);
    store.setError('save failed');
    expect(store.isError()).toBe(true);
    expect(store.errorMessage()).toBe('save failed');
    store.clearError();
    expect(store.isError()).toBe(false);
  });

  it('sets error state when the sections stream fails', async () => {
    store = makeStore({ ...sectionServiceMock(), list: vi.fn(() => mockError('load failed')) });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.isError()).toBe(true);
  });
});
