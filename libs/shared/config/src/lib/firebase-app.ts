import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { OkrEnvironment, TenantMode } from './env';

/**
 * The one Firebase app of this app start (spec 1.179, phase 2).
 *
 * A tenant switch reloads the app, so one start serves exactly one tenant. In runtime mode (the
 * iOS portal) that start's Firebase app is named after the tenant: Firebase keys the Auth session
 * (`firebase:authUser:<apiKey>:<appName>`) and the Firestore IndexedDB cache by app name, so every
 * tenant keeps its own login and its own cache, and a switch signs nobody out. Fixed mode (every
 * tenant app) keeps the default app, so its stored sessions stay valid.
 *
 * Code that needs the app calls `activeFirebaseApp()`, never `getApp()` (that is the default app,
 * which does not exist in the portal).
 */
const DEFAULT_APP_NAME = '[DEFAULT]';
let activeName: string | null = null;

export function firebaseAppName(env: OkrEnvironment, mode: TenantMode): string {
  return mode === 'runtime' ? env.tenantId : DEFAULT_APP_NAME;
}

/** Creates (or returns) the app of this start. Call once, before anything else touches Firebase. */
export function initOkrFirebaseApp(env: OkrEnvironment, mode: TenantMode = 'fixed'): FirebaseApp {
  const name = firebaseAppName(env, mode);
  const existing = getApps().find((a) => a.name === name);
  const app = existing ?? initializeApp(env.firebase, name);
  activeName = name;
  return app;
}

/** The app of this start; before `initOkrFirebaseApp` the default app (tenant apps, unit tests). */
export function activeFirebaseApp(): FirebaseApp {
  return activeName === null ? getApp() : getApp(activeName);
}

/** The active app's name; the default name before init (session keys of tenant apps). */
export function activeFirebaseAppName(): string {
  return activeName ?? DEFAULT_APP_NAME;
}

/** Tests only: forget the active app (the test deletes the Firebase apps itself). */
export function resetActiveFirebaseAppForTests(): void {
  activeName = null;
}
