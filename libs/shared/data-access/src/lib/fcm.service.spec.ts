import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '@okr/shared-config';

const m = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  pnUnregister: vi.fn(async () => undefined),
  auth: { currentUser: { uid: 'A' } as { uid: string } | null },
  deleteDoc: vi.fn(async () => undefined),
  unregisterCallable: vi.fn(async () => ({ data: { removed: true } })),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: m.isNative, getPlatform: m.getPlatform } }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { unregister: m.pnUnregister, createChannel: vi.fn(), addListener: vi.fn(), register: vi.fn(), requestPermissions: vi.fn(), checkPermissions: vi.fn() },
}));
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => m.auth }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), doc: vi.fn((..._a: unknown[]) => ({})), setDoc: vi.fn(), deleteDoc: m.deleteDoc,
  serverTimestamp: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(), documentId: vi.fn(), getDocs: vi.fn(), writeBatch: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => m.unregisterCallable }));
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(), getToken: vi.fn(), onMessage: vi.fn(), isSupported: vi.fn(async () => false),
}));

const { FcmService } = await import('./fcm.service');

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
  });
});
