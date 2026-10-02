import { inject, InjectionToken } from "@angular/core";
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getApp } from "firebase/app";
import { ENV } from "./env";
import { isFirefox, isIos, isSafari } from "./firestore";

export const AUTH_EMULATOR_PORT = 9099;

/**
 * Whether this browser keeps the signed-in session in localStorage ONLY, with no IndexedDB in
 * the persistence list at all.
 *
 * On Safari (ITP) and Firefox (ETP/private mode) IndexedDB access is throttled/unreliable.
 * Mirrors the same carve-out already used for Firestore (see firestore.ts). isIos() is part of
 * the test because Apple mandates WebKit for EVERY iOS browser, so Chrome (CriOS), Edge (EdgiOS),
 * Firefox (FxiOS) and Opera (OPiOS) inherit Safari's throttled IndexedDB — but isSafari()
 * excludes them by design.
 */
export function usesLocalStorageOnlySession(): boolean {
  return isSafari() || isFirefox() || isIos();
}

export function authFactory() {
  // Persistence: on the throttled-IndexedDB browsers, localStorage ONLY. Ordering is not enough.
  // SCS-AZ's first fix (7.33.0) put localStorage first and kept IndexedDB as a fallback, and the
  // stall kept coming: PersistenceUserManager.create (@firebase/auth 1.13) probes EVERY listed
  // persistence in a Promise.all — IndexedDB's _isAvailable opens the db and writes a test key —
  // and after choosing one it _remove()s the key from all the others. A listed IndexedDB is
  // therefore awaited twice on every restore whatever its position, and a throttled open leaves
  // onAuthStateChanged pending with no upper bound. Cost of dropping it: a session that lives
  // ONLY in IndexedDB is not found and that user signs in once more; every restore since 7.33.0
  // has already migrated it into localStorage. All other browsers keep the IndexedDB-first default.
  const persistence = usesLocalStorageOnlySession()
    ? [browserLocalPersistence]
    : [indexedDBLocalPersistence, browserLocalPersistence];

  // Use initializeAuth without browserPopupRedirectResolver:
  // - The app uses email/password only (no OAuth popup/redirect flows)
  // - Omitting popupRedirectResolver prevents the Firebase auth cross-domain iframe
  //   (authIframe.js) from being created, which avoids its reCAPTCHA load on every page.
  const auth = initializeAuth(getApp(), { persistence });
  const _env = inject(ENV);

  if (_env.useEmulators) {
    connectAuthEmulator(auth, `http://localhost:${AUTH_EMULATOR_PORT}`, {
      disableWarnings: true,
    });
  }
  return auth;
}

export const AUTH = new InjectionToken('Firebase auth', {
  providedIn: 'root',
  factory: authFactory
});