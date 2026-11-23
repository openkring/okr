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
import { ArticleBlocksGate, SectionService } from '@okr/cms-section-data-access';
import type { SectionModel } from '@okr/shared-models';

import { openArticleEditor } from './article-editor.loader';
import { SectionStore } from './section.store';

vi.mock('./article-editor.loader', () => ({ openArticleEditor: vi.fn() }));
vi.mock('./section-edit.modal', () => ({ SectionEditModal: class SectionEditModal {} }));

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
  gate?: ReturnType<typeof gateMock>;
  modalController?: { create: ReturnType<typeof vi.fn> };
}

function gateMock(open: boolean) {
  return { open: signal(open), load: vi.fn().mockResolvedValue(open) };
}

function makeStore(sectionService = sectionServiceMock(), deps: StoreDeps = {}): SectionStore {
  const appStore = appStoreMock();
  if (deps.currentUser) appStore.currentUser = signal(deps.currentUser as unknown as undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SectionStore,
      { provide: AppStore, useValue: appStore },
      { provide: SectionService, useValue: sectionService },
      { provide: UploadService, useValue: {} },
      { provide: MatrixChatService, useValue: deps.chat ?? { isInitialized: false } },
      { provide: ChatStatusService, useValue: deps.chatStatus ?? chatStatusMock() },
      { provide: ModalController, useValue: deps.modalController ?? {} },
      { provide: ArticleBlocksGate, useValue: deps.gate ?? gateMock(false) },
      { provide: AlertController, useValue: deps.alertController ?? {} },
      { provide: ToastController, useValue: deps.toastController ?? {} },
      { provide: FirestoreService, useValue: {} },
      { provide: I18nService, useValue: { translateAll: () => new Proxy({}, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => 'x') }) } }
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

describe('SectionStore.edit of an article (1.175)', () => {
  const article = (o: object = {}): SectionModel => ({ okey: 'a1', type: 'article', title: 'T', properties: { images: [] }, ...o }) as unknown as SectionModel;
  const user = { okey: 'u1' };

  /** the form of today, dismissed with `data` */
  function formController(data?: unknown) {
    return { create: vi.fn().mockResolvedValue({ present: vi.fn(), onWillDismiss: vi.fn().mockResolvedValue(data ? { data, role: 'confirm' } : {}) }) };
  }

  function setup(gateOpen: boolean, data?: unknown) {
    const sectionService = sectionServiceMock();
    const gate = gateMock(gateOpen);
    const modalController = formController(data);
    const store = makeStore(sectionService, { gate, modalController, currentUser: user });
    const reload = vi.spyOn(store, 'reload').mockImplementation(() => undefined);
    return { store, gate, modalController, sectionService, reload };
  }

  beforeEach(() => vi.mocked(openArticleEditor).mockReset().mockResolvedValue(undefined));

  it('gate closed: the form of today opens and the store saves', async () => {
    const { store, gate, modalController, sectionService, reload } = setup(false, article({ title: 'U' }));
    expect(await store.edit(article(), false)).toBe('updated-id');
    expect(gate.load).toHaveBeenCalledTimes(1);
    expect(openArticleEditor).not.toHaveBeenCalled();
    expect(modalController.create).toHaveBeenCalledWith(expect.objectContaining({
      cssClass: 'modal-fullscreen',
      componentProps: expect.objectContaining({ section: article(), currentUser: user, tagModel: 'section', readOnly: false }),
    }));
    expect(sectionService.update).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('gate closed, new: the form of today gets the section without a key and the store creates', async () => {
    const { store, modalController, sectionService } = setup(false, article({ okey: '' }));
    expect(await store.edit(article({ okey: '' }), false)).toBe('new-id');
    expect(modalController.create.mock.calls[0][0].componentProps.section.okey).toBe('');
    expect(sectionService.create).toHaveBeenCalledTimes(1);
  });

  it('gate open: the article editor opens, its key is passed on, the store reloads once and writes nothing', async () => {
    const { store, modalController, sectionService, reload } = setup(true);
    vi.mocked(openArticleEditor).mockResolvedValue('a1_p13');
    const section = article();
    expect(await store.edit(section, false)).toBe('a1_p13');
    expect(openArticleEditor).toHaveBeenCalledTimes(1);
    const [controller, passed, options] = vi.mocked(openArticleEditor).mock.calls[0];
    expect(controller).toBe(modalController);
    expect(passed).toBe(section);   // raw, as read
    expect(options).toEqual(expect.objectContaining({ isNew: false, currentUser: user, tagModel: 'section' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(modalController.create).not.toHaveBeenCalled();
    expect(sectionService.create).not.toHaveBeenCalled();
    expect(sectionService.update).not.toHaveBeenCalled();
  });

  it('gate open, new: the article gets its key when the editor opens', async () => {
    const { store } = setup(true);
    const section = article({ okey: '' });
    await store.edit(section, false);
    const [, passed, options] = vi.mocked(openArticleEditor).mock.calls[0];
    expect(options.isNew).toBe(true);
    expect(passed.okey).toMatch(/^[a-z0-9]{20}$/);
    expect(section.okey).toBe('');
    expect(passed.roleNeeded).toBe('contentAdmin');
    expect(passed.properties.datePublished).toMatch(/^\d{8}$/);
    expect(passed.tenants).toEqual(['p13']);
  });

  it('a second press while the first is opening is ignored; afterwards it opens again', async () => {
    const { store, gate, modalController } = setup(true);
    let answer: (open: boolean) => void = () => undefined;
    gate.load.mockReturnValueOnce(new Promise<boolean>((resolve) => { answer = resolve; }));
    const first = store.edit(article(), false);
    expect(await store.edit(article(), false)).toBeUndefined();
    expect(await store.edit(article({ type: 'button' }), false)).toBeUndefined();
    answer(true);
    await first;
    expect(openArticleEditor).toHaveBeenCalledTimes(1);
    expect(modalController.create).not.toHaveBeenCalled();
    await store.edit(article(), false);
    expect(openArticleEditor).toHaveBeenCalledTimes(2);
  });

  it('a failed opening does not block the next one', async () => {
    const { store } = setup(true);
    vi.mocked(openArticleEditor).mockRejectedValueOnce(new Error('chunk'));
    await expect(store.edit(article(), false)).rejects.toThrow('chunk');
    await store.edit(article(), false);
    expect(openArticleEditor).toHaveBeenCalledTimes(2);
  });

  it('a save of the form that never ends does not block the next opening', async () => {
    const { store, sectionService, modalController } = setup(false, article());
    sectionService.update.mockReturnValue(new Promise(() => undefined));
    void store.edit(article(), false);
    await vi.waitFor(() => expect(sectionService.update).toHaveBeenCalledTimes(1));
    void store.edit(article(), false);
    await vi.waitFor(() => expect(modalController.create).toHaveBeenCalledTimes(2));
  });

  it('uploading into an article with blocks is refused, naming the article', async () => {
    const toastController = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    const store = makeStore(sectionServiceMock(), { toastController });
    Object.assign(store.i18n, { article_not_linked: () => 'Der Artikel «{name}» …' });
    await store.uploadImage(article({ name: 'Regatta', properties: { blocks: [] } }) as never);
    expect(toastController.create).toHaveBeenCalledWith(expect.objectContaining({ message: 'Der Artikel «Regatta» …' }));
  });

  it('gate open, nothing saved (closed, or the trial mode): no key, no reload', async () => {
    const { store, reload } = setup(true);
    expect(await store.edit(article(), false)).toBeUndefined();
    expect(reload).not.toHaveBeenCalled();
  });

  it('gate closed, an article with blocks: the article editor opens', async () => {
    const { store } = setup(false);
    await store.edit(article({ properties: { blocks: [] } }), false);
    expect(openArticleEditor).toHaveBeenCalledTimes(1);
  });

  it('read-only: the form of today, and the gate is not asked', async () => {
    const { store, gate, modalController } = setup(true);
    await store.edit(article(), true);
    expect(gate.load).not.toHaveBeenCalled();
    expect(openArticleEditor).not.toHaveBeenCalled();
    expect(modalController.create).toHaveBeenCalledTimes(1);
  });

  it('another type: the form of today, and the gate is not asked', async () => {
    const { store, gate, modalController } = setup(true);
    await store.edit(article({ type: 'button' }), false);
    expect(gate.load).not.toHaveBeenCalled();
    expect(openArticleEditor).not.toHaveBeenCalled();
    expect(modalController.create).toHaveBeenCalledTimes(1);
  });

  it('a travel journal: the form of today', async () => {
    const { store, modalController } = setup(true);
    await store.edit(article({ journalKey: 'j' }), false);
    expect(openArticleEditor).not.toHaveBeenCalled();
    expect(modalController.create).toHaveBeenCalledTimes(1);
  });
});
