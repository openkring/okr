import { describe, expect, it, vi } from 'vitest';
import { ApplicationRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { ChatStatusService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { MatrixChatService } from '@okr/chat-data-access';

import { MessagesStore } from './messages-section.store';

const i18nProxy = new Proxy({}, { get: () => () => 'x' });

function matrixMock() {
  return {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    rooms: of([]),
    roomsLoaded: new BehaviorSubject(false),
    syncState: of('PREPARED'),
  };
}

function makeStore(blocked: boolean, matrix = matrixMock()) {
  const isEffectivelyBlocked = vi.fn(() => blocked);
  const status = signal<{ blockedAt?: string } | undefined>(blocked ? { blockedAt: '20261019140500' } : undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MessagesStore,
      {
        provide: AppStore,
        useValue: {
          currentUser: signal({ personKey: 'p1' }),
          tenantId: signal('p13'),
          allGroupsAndChats: signal([]),
          allPersons: signal([]),
          env: { services: { matrixHomeserver: 'https://matrix.example' } },
        },
      },
      { provide: ChatStatusService, useValue: { isEffectivelyBlocked, status, message: signal('') } },
      { provide: I18nService, useValue: { translateAll: () => i18nProxy } },
      { provide: MatrixChatService, useValue: matrix },
    ],
  });
  const injectorGet = vi.spyOn(TestBed.inject(Injector), 'get');
  return { store: TestBed.inject(MessagesStore), matrix, injectorGet };
}

describe('MessagesStore (1.107 chat block)', () => {
  it('never resolves the chat service nor calls ensureInitialized while blocked', async () => {
    const { store, matrix, injectorGet } = makeStore(true);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.isBlocked()).toBe(true);
    expect(store.isLoading()).toBe(false);
    expect(store.rooms()).toEqual([]);
    expect(matrix.ensureInitialized).not.toHaveBeenCalled();
    expect(injectorGet).not.toHaveBeenCalledWith(MatrixChatService);
    expect(store.blockedSince()).toBe('x');
  });

  it('starts the chat when not blocked (control)', async () => {
    const { store, matrix } = makeStore(false);
    await vi.waitFor(() => expect(matrix.ensureInitialized).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(store.isBlocked()).toBe(false);
  });
});
