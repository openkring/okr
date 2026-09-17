import { inject, InjectionToken } from "@angular/core";
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getApp } from "firebase/app";
import { ENV } from "./env";
import { isFirefox, isIos, isSafari } from "./firestore";

export const AUTH_EMULATOR_PORT = 9099;

export function authFactory() {
  // Persistence order: Firebase Auth restores the signed-in session from the FIRST available
  // persistence on every load. On Safari (ITP) and Firefox (ETP/private mode) IndexedDB access
  // is throttled/unreliable, so we prefer localStorage (browserLocalPersistence) — synchronous
  // and not subject to that throttling — and keep IndexedDB only as a fallback. All other
  // browsers keep the IndexedDB-first default. Defensive: mirrors the same "avoid IndexedDB on
  // Safari/Firefox" carve-out already used for Firestore (see firestore.ts).
  //
  // isIos() is part of the test for the same reason it is part of the Firestore one: Apple
  // mandates WebKit for EVERY iOS browser, so Chrome (CriOS), Edge (EdgiOS), Firefox (FxiOS) and
  // Opera (OPiOS) inherit Safari's exact ITP-throttled IndexedDB — but isSafari() excludes them
  // by design. Without this they took the IndexedDB-FIRST path, where a throttled open leaves
  // onAuthStateChanged pending and the boot sits in the session-restore gate (SCS-AZ) with no
  // upper bound of its own.
  const persistence = (isSafari() || isFirefox() || isIos())
    ? [browserLocalPersistence, indexedDBLocalPersistence]
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