import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { mockCollection, mockError } from '@okr/shared-feature/testing';
import { ChatStatusService, FirestoreService } from '@okr/shared-data-access';
import { ChatBlockedError } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { UploadService } from '@okr/avatar-data-access';
import { MatrixChatService } from '@okr/chat-data-access';
import { SectionService } from '@okr/cms-section-data-access';

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

function chatStatusMock(blocked = false, message = '') {
  return {
    isEffectivelyBlocked: vi.fn(() => blocked),
    message: signal(message),
  };
}

function alertControllerMock() {
  return {
    create: vi.fn().mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({}),
    }),
  };
}

interface StoreDeps {
  chatStatus?: ReturnType<typeof chatStatusMock>;
  chat?: Record<string, unknown>;
  alertController?: ReturnType<typeof alertControllerMock>;
  toastController?: { create: ReturnType<typeof vi.fn> };
  currentUser?: unknown;
}

function makeStore(sectionService = sectionServiceMock(), deps: StoreDeps = {}): SectionStore {
  const appStore = appStoreMock();
  if (deps.currentUser) appStore.currentUser = signal(deps.currentUser as undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SectionStore,
      { provide: AppStore, useValue: appStore },
      { provide: SectionService, useValue: sectionService },
      { provide: UploadService, useValue: {} },
      { provide: MatrixChatService, useValue: deps.chat ?? { isInitialized: false } },
      { provide: ChatStatusService, useValue: deps.chatStatus ?? chatStatusMock() },
      { provide: ModalController, useValue: {} },
      { provide: AlertController, useValue: deps.alertController ?? {} },
      { provide: ToastController, useValue: deps.toastController ?? {} },
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
      { okey: '1', index: 'hero', type: 'article', state: 'published', tags: '' },
      { okey: '2', index: 'intro', type: 'article', state: 'published', tags: '' }
    ];
    store = makeStore(sectionServiceMock(sections));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.sectionsCount()).toBe(2);
    store.setSearchTerm('hero');
    expect(store.filteredSections()?.map((s) => s.okey)).toEqual(['1']);
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

describe('SectionStore.sendEmergencyMessage while the chat is blocked (1.107)', () => {
  const user = { firstName: 'A', lastName: 'B', personKey: 'p1' };

  function setup(chatStatus: ReturnType<typeof chatStatusMock>, ensureInitialized: () => Promise<void>) {
    const chat = { ensureInitialized: vi.fn(ensureInitialized), requestGroupRoomAccess: vi.fn(), sendMessage: vi.fn() };
    const alertController = alertControllerMock();
    const toastController = { create: vi.fn() };
    const store = makeStore(sectionServiceMock(), { chatStatus, chat, alertController, toastController, currentUser: user });
    return { store, chat, alertController, toastController };
  }

  it('shows the admin message and never touches the chat when already blocked', async () => {
    const { store, chat, alertController, toastController } = setup(chatStatusMock(true, 'Wartung bis 18 Uhr'), () => Promise.resolve());
    await store.sendEmergencyMessage();
    expect(chat.ensureInitialized).not.toHaveBeenCalled();
    expect(alertController.create).toHaveBeenCalledWith(expect.objectContaining({ message: 'Wartung bis 18 Uhr' }));
    expect(toastController.create).not.toHaveBeenCalled();
  });

  it('shows the notice, not an error toast, when ensureInitialized rejects with ChatBlockedError', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, alertController, toastController } = setup(chatStatusMock(false), () => Promise.reject(new ChatBlockedError()));
    await store.sendEmergencyMessage();
    expect(alertController.create).toHaveBeenCalledTimes(1);
    expect(toastController.create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('treats a generic error as blocked when the block arrives mid-flight', async () => {
    const chatStatus = chatStatusMock(false);
    chatStatus.isEffectivelyBlocked.mockReturnValueOnce(false).mockReturnValue(true);
    const { store, alertController, toastController } = setup(chatStatus, () => Promise.reject(new Error('Client not initialized')));
    await store.sendEmergencyMessage();
    expect(alertController.create).toHaveBeenCalledTimes(1);
    expect(toastController.create).not.toHaveBeenCalled();
  });
});
