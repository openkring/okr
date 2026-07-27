import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

import { AUTH, ENV, FIRESTORE } from '@okr/shared-config';
import { DbQuery } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ToastController } from '@ionic/angular/standalone';

// Controllable stand-in for the rxfire real-time stream. Each test swaps the
// implementation to emit data or to error like a Firestore Listen stream does
// (e.g. an async PERMISSION_DENIED during token refresh — the SCS-13 crash).
const collectionDataMock = vi.fn<() => Observable<unknown[]>>();
const docDataMock = vi.fn<() => Observable<unknown>>(() => of(undefined));

vi.mock('rxfire/firestore', () => ({
  collectionData: () => collectionDataMock(),
  docData: () => docDataMock(),
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

function makeService(currentUser: unknown = { uid: 'u1' }): FirestoreService {
  TestBed.configureTestingModule({
    providers: [
      FirestoreService,
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ENV, useValue: { tenantId: 'scs', services: {} } },
      { provide: FIRESTORE, useValue: {} },
      { provide: AUTH, useValue: { currentUser } },
      { provide: ToastController, useValue: {} },
      { provide: I18nService, useValue: { translateAll: vi.fn(() => ({})) } },
    ],
  });
  return TestBed.inject(FirestoreService);
}

/** A Firestore Listen rejection, as the SDK raises it. */
function permissionDenied(): Error & { code: string } {
  return Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
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

  // signOut() revokes the token and the server terminates every still-open rule-gated
  // listener with PERMISSION_DENIED at once. That burst is expected teardown, so it must
  // not be reported as an error — it drowned out genuine failures on every logout.
  it('does not report a permission error raised after sign-out as an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    collectionDataMock.mockReturnValue(throwError(() => permissionDenied()));
    const svc = makeService(null);   // signed out
    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));
    expect(rows).toEqual([]);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  // The counterpart: denied while still signed in is a real rules/query defect
  // (e.g. a query that doesn't constrain the field its rule reads) and must stay loud.
  it('still reports a permission error raised while signed in', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    collectionDataMock.mockReturnValue(throwError(() => permissionDenied()));
    const svc = makeService({ uid: 'u1' });
    await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  // A non-permission failure (network, unavailable) is never sign-out teardown,
  // so it stays loud even with nobody signed in.
  it('still reports a non-permission stream error when signed out', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    collectionDataMock.mockReturnValue(
      throwError(() => Object.assign(new Error('backend unavailable'), { code: 'unavailable' })),
    );
    const svc = makeService(null);
    await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('FirestoreService.readModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    docDataMock.mockReturnValue(of(undefined));
  });

  it('emits the document on the happy path', async () => {
    docDataMock.mockReturnValue(of({ okey: 'u1' }));
    const svc = makeService();
    const user = await firstValueFrom(svc.readModel('users', 'u1'));
    expect(user).toEqual({ okey: 'u1' });
  });

  // Root cause of SCS-1E: the users/{uid} rule requires signedIn(), so a sign-out or token
  // refresh makes the still-open docData listener fail with PERMISSION_DENIED. That async error
  // must NOT propagate — AppStore.currentUserResource consumes this stream, and an errored
  // resource re-throws ResourceValueError from .value() inside change detection, crashing the app.
  // Emitting undefined instead reads as "no current user" to every downstream guard.
  it('recovers to undefined when the stream errors asynchronously', async () => {
    docDataMock.mockReturnValue(
      throwError(() => new Error('Missing or insufficient permissions.')),
    );
    const svc = makeService();
    const user = await firstValueFrom(svc.readModel('users', 'u1'));
    expect(user).toBeUndefined();
  });
});
