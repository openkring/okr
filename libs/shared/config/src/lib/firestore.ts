import { Inject, InjectionToken } from "@angular/core";
import { connectFirestoreEmulator, EmulatorMockTokenOptions, initializeFirestore } from "firebase/firestore";
import { BkEnvironment, ENV } from "./env";
import { getApp } from "firebase/app";

export const FIRESTORE_EMULATOR_PORT = 8080;
// Flag to track initialization
let isFirestoreInitialized = false;

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
 * On Safari, however, WebSockets are not reliable for Firestore and persistency with IndexdDB can interfere and trigger the same errors when reloading a page. 
 * That's why we use long polling to avoid WebChannel CORS issues and we additionally disable persistence for Safari to prevent IndexdDB-related errors on reload.
 */
export const FIRESTORE = new InjectionToken('Firebase Firestore', {
  providedIn: 'root',
  factory: () => {
    const app = getApp();
    const isSafariBrowser = isSafari();
    const firestore = initializeFirestore(app, {
      experimentalForceLongPolling: isSafariBrowser, // Force long polling for Safari
      experimentalAutoDetectLongPolling: !isSafariBrowser, // Disable auto-detection for non-Safari
      ignoreUndefinedProperties: true, // Prevent undefined field errors
    });

    const _env = Inject(ENV) as BkEnvironment;
  /* 
    Configure mockUserToken for emulator (optional, set to undefined if no mock token needed)
    For testing purposes, you can set mockUserToken, e.g.
    const mockUserToken: EmulatorMockTokenOptions = {
      user_id: 'test-admin',
      email: 'admin@bkaiser-org.com',
      email_verified: true,
      customClaims: { admin: true },
    };
  */

    const mockUserToken: EmulatorMockTokenOptions | undefined = undefined; // Adjust based on your auth needs

    if (_env.useEmulators) {
      connectFirestoreEmulator(firestore, 'localhost', FIRESTORE_EMULATOR_PORT, { mockUserToken });
    }

    // Log initialization details for debugging
    console.log('Firestore initialized:', {
      isSafari: isSafariBrowser,
      longPolling: isSafariBrowser,
      emulator: _env.useEmulators,
      mockUserToken: mockUserToken ? 'configured' : 'undefined',
      timestamp: new Date().toISOString(),
    });

    isFirestoreInitialized = true; // Set flag after initialization
    return firestore;
  },
});

/**
 * Check if Firestore is initialized.
 * @returns true if Firestore is fully initialized
 */
export function isFirestoreInitializedCheck(): boolean {
  return isFirestoreInitialized;
}