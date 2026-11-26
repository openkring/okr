import { afterEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';
import { OkrEnvironment } from './env';
import { activeFirebaseApp, activeFirebaseAppName, firebaseAppName, initOkrFirebaseApp, resetActiveFirebaseAppForTests } from './firebase-app';
import { firebaseSessionKey } from './stalled-restore';

const env = (tenantId = 'kring') =>
  ({ tenantId, appId: tenantId, firebase: { apiKey: 'k', projectId: 'p', appId: '1:2:web:3' } }) as unknown as OkrEnvironment;

afterEach(async () => {
  resetActiveFirebaseAppForTests();
  await Promise.all(getApps().map((a) => deleteApp(a)));
});

describe('firebaseAppName', () => {
  it('fixed mode uses the default app', () => expect(firebaseAppName(env(), 'fixed')).toBe('[DEFAULT]'));
  it('runtime mode names the app after the tenant', () => expect(firebaseAppName(env('scs'), 'runtime')).toBe('scs'));
});

describe('initOkrFirebaseApp', () => {
  it('fixed mode initialises the default app', () =>
    expect(initOkrFirebaseApp(env()).name).toBe('[DEFAULT]'));

  it('runtime mode initialises an app named after the tenant', () =>
    expect(initOkrFirebaseApp(env('scs'), 'runtime').name).toBe('scs'));

  it('is idempotent', () => expect(initOkrFirebaseApp(env())).toBe(initOkrFirebaseApp(env())));
});

describe('activeFirebaseApp', () => {
  it('returns the initialised app', () => {
    const app = initOkrFirebaseApp(env('p13'), 'runtime');
    expect(activeFirebaseApp()).toBe(app);
  });

  it('falls back to the default app before init', () => {
    const app = initOkrFirebaseApp(env());
    resetActiveFirebaseAppForTests();
    expect(activeFirebaseApp()).toBe(app);
  });

  it('activeFirebaseAppName falls back to the default name before init', () =>
    expect(activeFirebaseAppName()).toBe('[DEFAULT]'));
});

describe('session key', () => {
  it('uses the active app name', () => {
    initOkrFirebaseApp(env('scs'), 'runtime');
    expect(firebaseSessionKey('k')).toBe('firebase:authUser:k:scs');
  });

  it('keeps the default key in fixed mode', () => {
    initOkrFirebaseApp(env());
    expect(firebaseSessionKey('k')).toBe('firebase:authUser:k:[DEFAULT]');
  });
});
