import { inject, InjectionToken } from "@angular/core";
import {
  connectFirestoreEmulator,
  EmulatorMockTokenOptions,
  Firestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore";
import { ENV } from "./env";
import { getApp } from "firebase/app";

export const FIRESTORE_EMULATOR_PORT = 8080;
let isFirestoreInitialized = false;

// Detects Safari (including iOS Safari). Excludes Chrome/Chromium/CriOS/Opera which also include 'safari' in their UA.
// Cannot import from @bk2/shared-util-angular — that lib already imports from @bk2/shared-config (circular).
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/OPR\/|opera|chrome|chromium|crios|firefox|fxios/i.test(ua);
}

// Detects Firefox (desktop and iOS 'fxios'). Firefox shares Safari's WebChannel/IndexedDB
// sensitivities under Enhanced Tracking Protection (strict / "block cookies and site data" /
// private mode): the streaming transport can stall and the IndexedDB persistent cache can hang
// on open, leaving Firestore's first snapshot pending forever. So Firefox gets the same
// long-polling transport as Safari and skips the persistent cache.
export function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /firefox|fxios/i.test(navigator.userAgent);
}

/**
 * Firestore initialization.
 *
 * Transport: Safari and Firefox force long polling (WebChannel/WebSocket reliability issue on
 * Safari/iOS and on Firefox under Enhanced Tracking Protection). Other browsers use auto-detection.
 *
 * Cache: Safari and Firefox use in-memory cache; all other browsers use persistentLocalCache
 * with persistentSingleTabManager. Both Safari (under ITP) and Firefox (under ETP/private mode)
 * can hang on the async IndexedDB open — the open never settles, so the first snapshot never
 * arrives and list views spin forever (observed live: normal Safari with persistentLocalCache
 * hangs the side-menu; the same Safari in private mode falls back to memory cache and works).
 * The async hang escapes the try/catch below (which only catches a synchronous throw), so it
 * must be avoided up front, not caught. This re-establishes the "no IndexedDB on Safari" carve-out
 * (the v12 #9056 fix addressed a different, synchronous failure — not this ITP open-hang). Both
 * lose offline persistence, which is acceptable. Single-tab manager avoids the open multi-tab
 * leader-election edge cases (#6511, #8314, #6806). If persistent init still throws on the
 * remaining browsers (e.g. open issue #8860), fall back to in-memory cache.
 *
 * Eviction: navigator.storage.persist() is requested on first init — harmless in a tab,
 * materially helps an installed iOS Home Screen PWA stay durable across WebKit storage pressure.
 */
export const FIRESTORE = new InjectionToken<Firestore>('Firebase Firestore', {
  providedIn: 'root',
  factory: () => {
    const app = getApp();
    const isSafariBrowser = isSafari();
    const isFirefoxBrowser = isFirefox();
    // Safari and Firefox both need long polling (WebChannel reliability issue).
    const useLongPolling = isSafariBrowser || isFirefoxBrowser;

    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist()
        .then(granted => console.log('Firestore storage.persist() granted:', granted))
        .catch(err => console.warn('Firestore storage.persist() failed:', err));
    }

    const baseOptions = {
      experimentalForceLongPolling: useLongPolling,
      experimentalAutoDetectLongPolling: !useLongPolling,
      ignoreUndefinedProperties: true,
    };

    let firestore: Firestore;
    let cacheMode: 'persistent-single-tab' | 'memory-fallback';
    // Safari and Firefox: skip the IndexedDB persistent cache outright. Its open is async, so a
    // hang under Safari ITP / Firefox ETP / private mode escapes the try/catch below (which only
    // catches a synchronous throw) and stalls the first snapshot forever (e.g. the side-menu
    // spinner never clears). Memory cache avoids that; offline persistence is dropped.
    if (isFirefoxBrowser || isSafariBrowser) {
      firestore = initializeFirestore(app, {
        ...baseOptions,
        localCache: memoryLocalCache(),
      });
      cacheMode = 'memory-fallback';
    } else {
      try {
        firestore = initializeFirestore(app, {
          ...baseOptions,
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({}),
          }),
        });
        cacheMode = 'persistent-single-tab';
      } catch (e) {
        console.warn('Firestore persistent cache init failed, falling back to memory cache:', e);
        firestore = initializeFirestore(app, {
          ...baseOptions,
          localCache: memoryLocalCache(),
        });
        cacheMode = 'memory-fallback';
      }
    }

    const _env = inject(ENV);
    const mockUserToken: EmulatorMockTokenOptions | undefined = undefined;

    if (_env.useEmulators) {
      connectFirestoreEmulator(firestore, 'localhost', FIRESTORE_EMULATOR_PORT, { mockUserToken });
    }

    console.log('Firestore initialized:', {
      isSafari: isSafariBrowser,
      isFirefox: isFirefoxBrowser,
      longPolling: useLongPolling,
      cache: cacheMode,
      emulator: _env.useEmulators,
      mockUserToken: mockUserToken ? 'configured' : 'undefined',
      timestamp: new Date().toISOString(),
    });

    isFirestoreInitialized = true;
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