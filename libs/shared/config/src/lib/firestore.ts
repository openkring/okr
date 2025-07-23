import { Inject, InjectionToken } from "@angular/core";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import { BkEnvironment, ENV } from "./env";
import { getApp } from "firebase/app";

export const FIRESTORE_EMULATOR_PORT = 8080;

/**
 * Checks for safari in userAgent but excludes Chrome/Chromium, as they also include 'safari' in their user agent.
 * Returns false on the server (where navigator is not defined). ensuring compatibility with SSR.
 * @returns true if the browser is Safari, false otherwise
 */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false; // Server-side, not Safari
  }
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('chrome') && !userAgent.includes('chromium');
}

/**
 * By default, browsers use WebSockets for better performnace. 
 * On Safari, however, WebSockets are not reliable for Firestore. That's why we use long polling to avoid WebChannel CORS issues.
 */
export const FIRESTORE = new InjectionToken('Firebase firestore', {
  providedIn: 'root',
  factory: () => {
    const app = getApp();
    const firestore = initializeFirestore(app, {
      experimentalForceLongPolling: isSafari(), // Enable long polling only for Safari
    });
    const _env = Inject(ENV) as BkEnvironment;
    if (_env.useEmulators) {
      connectFirestoreEmulator(firestore, 'localhost', FIRESTORE_EMULATOR_PORT);
    }
    return firestore;
  }
});