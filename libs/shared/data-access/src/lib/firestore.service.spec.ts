import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { concat, defer, firstValueFrom, Observable, of, throwError } from 'rxjs';

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

// Writes must never reach the real Sentry client from a unit test.
const captureMessageMock = vi.hoisted(() => vi.fn());
vi.mock('@sentry/angular', () => ({ captureMessage: captureMessageMock }));

// App Check attestation is a network round trip; the service awaits it before re-attaching a
// denied listener, so the tests drive it directly.
const ensureAppCheckTokenMock = vi.hoisted(() => vi.fn(async () => true));

// Keep the real ENV/FIRESTORE injection tokens; only force the init guard true.
vi.mock('@okr/shared-config', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, isFirestoreInitializedCheck: () => true, ensureAppCheckToken: ensureAppCheckTokenMock };
});

import { doc, setDoc } from 'firebase/firestore';

import { FirestoreService } from './firestore.service';

const setDocMock = vi.mocked(setDoc);
const docMock = vi.mocked(doc);

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

/** A stream that fails the first `failures` subscriptions and then emits `value`. */
function failsThenEmits<T>(failures: number, value: T): Observable<T> {
  let attempt = 0;
  return defer(() => (attempt++ < failures ? throwError(() => permissionDenied()) : of(value)));
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

  // A backgrounded tab wakes with an EXPIRED App Check token (Safari suspends the refresh timer),
  // and the backend then kills every open listener at once with PERMISSION_DENIED — while the
  // user is still perfectly signed in. Before the retry, each of those listeners completed as an
  // empty stream and nothing ever re-subscribed: the whole app came back with empty lists and one
  // permission-denied line per collection. Refresh the token and re-attach instead.
  it('re-attaches a listener denied while signed in, after refreshing the App Check token', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    collectionDataMock.mockReturnValue(failsThenEmits(1, [{ okey: 's1' }]));
    const svc = makeService({ uid: 'u1' });

    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));

    expect(rows).toHaveLength(1);
    expect(ensureAppCheckTokenMock).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();   // recovered, so nothing to report
    error.mockRestore();
  });

  // The budget is bounded: a denial that outlives it is not about the token.
  it('gives up after the retry budget and falls back to an empty list', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    collectionDataMock.mockReturnValue(failsThenEmits(99, [{ okey: 's1' }]));
    const svc = makeService({ uid: 'u1' });

    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));

    expect(rows).toEqual([]);
    expect(ensureAppCheckTokenMock).toHaveBeenCalledTimes(2);   // DENIAL_RETRIES
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  // The loop that filled the console in bka-app: a permanently denied listener still REPLAYS its
  // cached snapshot on every resubscription, so the previous `resetOnSuccess: true` handed the
  // retry a fresh budget after each emission — emit, deny, retry, emit, forever, one console line
  // per collection per turn. The budget must therefore be time-scoped, not emission-scoped.
  it('stops retrying a listener that emits from cache before every denial', async () => {
    vi.useFakeTimers();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let subscriptions = 0;
    collectionDataMock.mockReturnValue(
      defer(() => {
        subscriptions++;
        return concat(of([{ okey: 's1' }]), throwError(() => permissionDenied()));
      }),
    );
    const svc = makeService({ uid: 'u1' });

    const sub = svc.searchData('sessions', QUERY, 'startedAt', 'desc').subscribe();
    await vi.advanceTimersByTimeAsync(10_000);   // far beyond the backoff of both retries

    expect(subscriptions).toBe(3);               // initial + DENIAL_RETRIES, then it gives up
    expect(debug).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();            // the denial finally surfaces instead of looping
    sub.unsubscribe();
    debug.mockRestore();
    error.mockRestore();
    vi.useRealTimers();
  });

  // Sign-out teardown must NOT be retried — the listeners belong to a session that ended, and
  // re-attaching them would fire a second denied round trip per collection on every logout.
  it('does not retry a denial raised after sign-out', async () => {
    collectionDataMock.mockReturnValue(failsThenEmits(1, [{ okey: 's1' }]));
    const svc = makeService(null);   // signed out

    const rows = await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));

    expect(rows).toEqual([]);
    expect(ensureAppCheckTokenMock).not.toHaveBeenCalled();
  });

  // Transport failures are the SDK's to retry; refreshing an App Check token does nothing for them.
  it('does not retry a non-permission stream error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    collectionDataMock.mockReturnValue(
      throwError(() => Object.assign(new Error('backend unavailable'), { code: 'unavailable' })),
    );
    const svc = makeService({ uid: 'u1' });

    await firstValueFrom(svc.searchData('sessions', QUERY, 'startedAt', 'desc'));

    expect(ensureAppCheckTokenMock).not.toHaveBeenCalled();
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
  // Same resume case as searchData, on the doc stream that backs AppStore.currentUserResource.
  // This one matters most: without the retry, the signed-in user's own users/{uid} listener dies
  // on resume, currentUser goes undefined, and every tenant-scoped resource gated on it collapses
  // to an empty list — the app looks logged in and holds no data.
  it('re-attaches a denied doc listener after refreshing the App Check token', async () => {
    docDataMock.mockReturnValue(failsThenEmits(1, { okey: 'u1' }));
    const svc = makeService({ uid: 'u1' });

    const user = await firstValueFrom(svc.readModel('users', 'u1'));

    expect(user).toEqual({ okey: 'u1' });
    expect(ensureAppCheckTokenMock).toHaveBeenCalledTimes(1);
  });

  it('recovers to undefined when the stream errors asynchronously', async () => {
    docDataMock.mockReturnValue(
      throwError(() => new Error('Missing or insufficient permissions.')),
    );
    const svc = makeService();
    const user = await firstValueFrom(svc.readModel('users', 'u1'));
    expect(user).toBeUndefined();
  });
});

describe('FirestoreService.createModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    ensureAppCheckTokenMock.mockResolvedValue(true);
    docMock.mockReturnValue({ id: 'a1' } as never);   // createModel returns ref.id
  });

  it('returns the document id on the happy path', async () => {
    setDocMock.mockResolvedValue(undefined);
    const svc = makeService();

    const key = await svc.createModel('activities', { okey: 'a1', tenants: ['scs'] } as never,
      undefined, undefined, undefined, true);

    expect(key).toBeDefined();
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(ensureAppCheckTokenMock).not.toHaveBeenCalled();
  });

  // Root cause of SCS-8N: App Check is ENFORCED on Firestore, and a cached token the backend no
  // longer accepts passes the caller's `ensureAppCheckToken()` pre-flight untouched (it returns
  // immediately while a token is cached). The write was then denied outright — the `auth/login`
  // activity written on the login page was lost and only a Sentry warning remained. A forced
  // attestation plus one retry recovers it, exactly as recoverFromTokenDenial does for reads.
  it('retries a denied write once after forcing a fresh App Check token', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    setDocMock.mockRejectedValueOnce(permissionDenied()).mockResolvedValue(undefined);
    const svc = makeService();

    const key = await svc.createModel('activities', { okey: 'a1', tenants: ['scs'] } as never,
      undefined, undefined, undefined, true);

    expect(key).toBeDefined();
    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(ensureAppCheckTokenMock).toHaveBeenCalledWith(undefined, true);   // forced, not the cache
    expect(captureMessageMock).not.toHaveBeenCalled();                       // recovered, so no ticket
    debug.mockRestore();
  });

  // A denial that survives a freshly minted token is not about the token — report it once and stop.
  it('reports to Sentry when the retry is denied as well', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDocMock.mockRejectedValue(permissionDenied());
    const svc = makeService();

    const key = await svc.createModel('activities', { okey: 'a1', tenants: ['scs'] } as never,
      undefined, undefined, undefined, true);

    expect(key).toBeUndefined();
    expect(setDocMock).toHaveBeenCalledTimes(2);          // one retry, never a loop
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    debug.mockRestore();
    error.mockRestore();
  });

  // The Sentry report is the ONLY trace a suppressed write leaves, so it has to say WHICH of the
  // two causes a permission-denied write had. SCS-8M sat unclassifiable for want of this tag: its
  // rules were verified (emulator) to ALLOW the payload, so the denial was attestation — but
  // nothing in the ticket could distinguish that from a rules defect.
  it('tags a surviving denial as `refreshed` when attestation succeeded', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDocMock.mockRejectedValue(permissionDenied());
    ensureAppCheckTokenMock.mockResolvedValue(true);
    const svc = makeService();

    await svc.createModel('activities', { okey: 'a1', tenants: ['scs'] } as never,
      undefined, undefined, undefined, true);

    expect(captureMessageMock.mock.calls[0][1].tags).toMatchObject({
      firestoreCode: 'permission-denied', appCheck: 'refreshed',
    });
    debug.mockRestore();
    error.mockRestore();
  });

  // The recovery is a no-op when App Check cannot attest at all (unregistered / blocked / timed
  // out). Claiming a refresh here is what sent an earlier investigation down the wrong path.
  it('tags a surviving denial as `unavailable` when attestation produced no token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDocMock.mockRejectedValue(permissionDenied());
    ensureAppCheckTokenMock.mockResolvedValue(false);
    const svc = makeService();

    await svc.createModel('activities', { okey: 'a1', tenants: ['scs'] } as never,
      undefined, undefined, undefined, true);

    expect(captureMessageMock.mock.calls[0][1].tags).toMatchObject({ appCheck: 'unavailable' });
    expect(warn).toHaveBeenCalled();     // and the log says so, instead of claiming a refresh
    warn.mockRestore();
    error.mockRestore();
  });

  // Transport failures are the SDK's to retry; a fresh App Check token does nothing for them.
  it('does not retry a non-permission write failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDocMock.mockRejectedValue(Object.assign(new Error('backend unavailable'), { code: 'unavailable' }));
    const svc = makeService();

    await svc.createModel('activities', { okey: 'a1', tenants: ['scs'] } as never,
      undefined, undefined, undefined, true);

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(ensureAppCheckTokenMock).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
