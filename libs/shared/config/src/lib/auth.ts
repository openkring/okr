import { inject, InjectionToken } from "@angular/core";
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getApp } from "firebase/app";
import { ENV } from "./env";

export const AUTH_EMULATOR_PORT = 9099;

export function authFactory() {
  // Use initializeAuth without browserPopupRedirectResolver:
  // - The app uses email/password only (no OAuth popup/redirect flows)
  // - Omitting popupRedirectResolver prevents the Firebase auth cross-domain iframe
  //   (authIframe.js) from being created, which avoids its reCAPTCHA load on every page.
  const auth = initializeAuth(getApp(), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
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