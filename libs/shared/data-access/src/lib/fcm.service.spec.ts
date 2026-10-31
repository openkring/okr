import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '@okr/shared-config';

const m = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  pnUnregister: vi.fn(async () => undefined),
  auth: { currentUser: { uid: 'A' } as { uid: string } | null },
  deleteDoc: vi.fn(async () => undefined),
  unregisterCallable: vi.fn(async () => ({ data: { removed: true } })),
  registerCallable: vi.fn(async () => ({ data: {} })),
  setDoc: vi.fn(async () => undefined),
  order: [] as string[],
  listeners: {} as Record<string, (ev: unknown) => unknown>,
  addListener: vi.fn(),
  register: vi.fn(),
  checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
  messagingSupported: vi.fn(async () => false),
  getToken: vi.fn(async () => null as string | null),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: m.isNative, getPlatform: m.getPlatform } }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { unregister: m.pnUnregister, createChannel: vi.fn(), addListener: m.addListener, register: m.register, requestPermissions: vi.fn(), checkPermissions: m.checkPermissions },
}));
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => m.auth }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), doc: vi.fn((..._a: unknown[]) => ({})), setDoc: m.setDoc, deleteDoc: m.deleteDoc,
  serverTimestamp: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(), documentId: vi.fn(), getDocs: vi.fn(), writeBatch: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_f: unknown, name: string) => name === 'registerMatrixPusher' ? m.registerCallable : m.unregisterCallable,
}));
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})), getToken: m.getToken, onMessage: vi.fn(), isSupported: m.messagingSupported,
}));

const { FcmService, NATIVE_REGISTRATION_TIMEOUT_MS } = await import('./fcm.service');

type Priv = {
  _currentToken: string | null;
  pusherInFlight?: { token: string; promise: Promise<void> };
  savesInFlight: Set<Promise<boolean>>;
};

function make() {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: 'browser' }, { provide: ENV, useValue: {} }],
  });
  const svc = TestBed.inject(FcmService);
  (svc as unknown as Priv)._currentToken = 'tok';
  return svc;
}

describe('FcmService.disablePush', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    m.isNative.mockReturnValue(false);
    m.auth.currentUser = { uid: 'A' };
    m.deleteDoc.mockClear();
    m.unregisterCallable.mockClear();
    m.pnUnregister.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('still removes token and pusher in the normal logout', async () => {
    const svc = make();
    await svc.disablePush('A');
    expect(m.unregisterCallable).toHaveBeenCalledWith({ pushkey: 'tok' });
    expect(m.deleteDoc).toHaveBeenCalled();
  });

  it('does not unregister the pusher once another uid is signed in', async () => {
    const svc = make();
    let release!: () => void;
    (svc as unknown as Priv).pusherInFlight = { token: 'tok', promise: new Promise<void>(r => { release = r; }) };
    const done = svc.disablePush('A');
    await Promise.resolve();
    svc.beginSession();
    m.auth.currentUser = { uid: 'B' };
    release();
    await done;
    expect(m.unregisterCallable).not.toHaveBeenCalled();
  });

  it('does not unregister native push after a new session began', async () => {
    m.isNative.mockReturnValue(true);
    const svc = make();
    let release!: () => void;
    (svc as unknown as Priv).savesInFlight.add(new Promise<boolean>(r => { release = () => r(true); }));
    const done = svc.disablePush('A');
    await Promise.resolve();
    svc.beginSession();
    m.auth.currentUser = { uid: 'B' };
    release();
    await done;
    expect(m.pnUnregister).not.toHaveBeenCalled();
    expect(m.deleteDoc).not.toHaveBeenCalled();
  });

  it('skips logout steps once signed out without a new session', async () => {
    m.isNative.mockReturnValue(true);
    const svc = make();
    m.auth.currentUser = null;
    await svc.disablePush('A');
    expect(m.unregisterCallable).not.toHaveBeenCalled();
    expect(m.deleteDoc).not.toHaveBeenCalled();
    expect(m.pnUnregister).not.toHaveBeenCalled();
  });
});

function makeFresh(env: object = {}) {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: 'browser' }, { provide: ENV, useValue: env }],
  });
  return TestBed.inject(FcmService);
}

function emit(event: string, payload: unknown): void {
  const cb = m.listeners[event];
  if (!cb) throw new Error(`no ${event} listener`);
  void cb(payload);
}

/** Lets the async permission checks and listener installation run up to register(). */
async function untilRegistered(): Promise<void> {
  await vi.waitFor(() => expect(m.register).toHaveBeenCalled());
}

describe('FcmService native registration', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    m.isNative.mockReturnValue(true);
    m.getPlatform.mockReturnValue('ios');
    m.auth.currentUser = { uid: 'A' };
    m.order.length = 0;
    m.listeners = {};
    m.addListener.mockReset().mockImplementation(async (event: string, cb: (ev: unknown) => unknown) => {
      m.order.push(`addListener:${event}`);
      m.listeners[event] = cb;
      return { remove: vi.fn() };
    });
    m.register.mockReset().mockImplementation(async () => { m.order.push('register'); });
    m.setDoc.mockClear();
    m.deleteDoc.mockClear();
    m.registerCallable.mockClear();
    m.unregisterCallable.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the listeners before register()', async () => {
    const svc = makeFresh();
    const done = svc.registerAndSave('A');
    await untilRegistered();
    expect(m.order).toEqual(['addListener:registration', 'addListener:registrationError', 'register']);
    emit('registration', { value: 't1' });
    await done;
  });

  it('resolves null after 15 s and does not add a second listener pair', async () => {
    vi.useFakeTimers();
    const svc = makeFresh();
    const first = svc.registerAndSave('A');
    await vi.advanceTimersByTimeAsync(NATIVE_REGISTRATION_TIMEOUT_MS);
    expect(NATIVE_REGISTRATION_TIMEOUT_MS).toBe(15_000);
    await expect(first).resolves.toBeNull();
    const second = svc.registerAndSave('A');
    await vi.advanceTimersByTimeAsync(0);
    expect(m.register).toHaveBeenCalledTimes(2);
    expect(m.addListener).toHaveBeenCalledTimes(2);
    emit('registration', { value: 't1' });
    await expect(second).resolves.toBe('t1');
  });

  it('shares one pending registration between overlapping calls', async () => {
    const svc = makeFresh();
    const a = svc.registerAndSave('A');
    await untilRegistered();
    const b = svc.registerAndSave('A');
    // Let b run its permission checks and join the pending registration.
    await new Promise(r => setTimeout(r, 0));
    emit('registration', { value: 't1' });
    await expect(a).resolves.toBe('t1');
    await expect(b).resolves.toBe('t1');
    expect(m.register).toHaveBeenCalledTimes(1);
  });

  it('resolves null on a registration error', async () => {
    const svc = makeFresh();
    const done = svc.registerAndSave('A');
    await untilRegistered();
    emit('registrationError', { error: 'no APNs' });
    await expect(done).resolves.toBeNull();
  });

  it('resolves with the first registration event and saves platform', async () => {
    const svc = makeFresh();
    const done = svc.registerAndSave('A');
    await untilRegistered();
    emit('registration', { value: 't1' });
    await expect(done).resolves.toBe('t1');
    expect(m.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: 't1', platform: 'ios' }), { merge: true });
  });

  it('a later registration event is saved as a refresh', async () => {
    const svc = makeFresh();
    const done = svc.registerAndSave('A');
    await untilRegistered();
    emit('registration', { value: 't1' });
    await done;
    emit('registration', { value: 't2' });
    await vi.waitFor(() => expect(m.registerCallable).toHaveBeenCalledWith(expect.objectContaining({ pushkey: 't2' })));
    expect(m.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: 't2', platform: 'ios' }), { merge: true });
    expect(svc.currentToken).toBe('t2');
  });

  it('a refresh after logout is ignored', async () => {
    const svc = makeFresh();
    const done = svc.registerAndSave('A');
    await untilRegistered();
    emit('registration', { value: 't1' });
    await done;
    await svc.disablePush('A');
    m.setDoc.mockClear();
    emit('registration', { value: 't2' });
    await new Promise(r => setTimeout(r, 0));
    expect(m.setDoc).not.toHaveBeenCalled();
    expect(m.registerCallable).not.toHaveBeenCalled();
    expect(svc.currentToken).toBeNull();
  });

  it('a refresh after a new session began is ignored until the next registration', async () => {
    const svc = makeFresh();
    const done = svc.registerAndSave('A');
    await untilRegistered();
    emit('registration', { value: 't1' });
    await done;
    await svc.disablePush('A');
    svc.beginSession();
    m.auth.currentUser = { uid: 'B' };
    m.setDoc.mockClear();
    emit('registration', { value: 't2' });
    await new Promise(r => setTimeout(r, 0));
    expect(m.setDoc).not.toHaveBeenCalled();
  });
});

describe('FcmService web registration', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    m.isNative.mockReturnValue(false);
    m.getPlatform.mockReturnValue('web');
    m.messagingSupported.mockResolvedValue(true);
    m.getToken.mockResolvedValue('w1');
    m.setDoc.mockClear();
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    m.messagingSupported.mockResolvedValue(false);
  });

  it('web token doc carries platform web', async () => {
    const svc = makeFresh({ services: { fcmVapidKey: 'vapid' } });
    await expect(svc.registerAndSave('A')).resolves.toBe('w1');
    expect(m.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: 'w1', platform: 'web' }), { merge: true });
  });
});
