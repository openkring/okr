import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

import { ENV, FIRESTORE } from '@okr/shared-config';
import { DbQuery } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ToastController } from '@ionic/angular/standalone';

// Controllable stand-in for the rxfire real-time stream. Each test swaps the
// implementation to emit data or to error like a Firestore Listen stream does
// (e.g. an async PERMISSION_DENIED during token refresh — the SCS-13 crash).
const collectionDataMock = vi.fn<() => Observable<unknown[]>>();

vi.mock('rxfire/firestore', () => ({
  collectionData: () => collectionDataMock(),
  docData: vi.fn(() => of(undefined)),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

// Keep the real ENV/FIRESTORE injection tokens; only force the init guard true.
vi.mock('@okr/shared-config', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, isFirestoreInitializedCheck: () => true };
});

import { FirestoreService } from './firestore.service';

const QUERY: DbQuery[] = [{ key: 'tenants', operator: 'array-contains', value: 'scs' }];

function makeService(): FirestoreService {
  TestBed.configureTestingModule({
    providers: [
      FirestoreService,
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ENV, useValue: { tenantId: 'scs', services: {} } },
      { provide: FIRESTORE, useValue: {} },
      { provide: ToastController, useValue: {} },
      { provide: I18nService, useValue: { translateAll: vi.fn(() => ({})) } },
    ],
  });
  return TestBed.inject(FirestoreService);
}

describe('FirestoreService.searchData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('emits the query results on the happy path', async () => {
    collectionDataMock.mockReturnValue(of([{ okey: 's1' }, { okey: 's2' }]));
    const svc = makeService();
    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));
    expect(rows).toHaveLength(2);
  });

  // Root cause of SCS-13: an async PERMISSION_DENIED from the real-time Listen
  // stream must NOT propagate as an error notification — otherwise the rxResource
  // consuming it flips to error status and `.value()` re-throws inside change
  // detection, crashing the app.
  it('recovers to an empty list when the stream errors asynchronously', async () => {
    collectionDataMock.mockReturnValue(
      throwError(() => new Error('Missing or insufficient permissions.')),
    );
    const svc = makeService();
    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));
    expect(rows).toEqual([]);
  });

  it('does not cache a failed stream, so a later subscription rebuilds the listener', async () => {
    collectionDataMock.mockReturnValueOnce(
      throwError(() => new Error('Missing or insufficient permissions.')),
    );
    const svc = makeService();
    await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));

    // second attempt: the transient error is gone, the query must succeed again
    collectionDataMock.mockReturnValue(of([{ okey: 's1' }]));
    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));
    expect(rows).toHaveLength(1);
  });
});
