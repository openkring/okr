import { Capacitor } from '@capacitor/core';
import { CustomProvider, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

/**
 * Which App Check provider the JS SDK gets (spec 1.10 §6.3).
 *
 * Web: reCAPTCHA Enterprise, as before. Native (Capacitor): the WebView runs at https://localhost,
 * which is not on the shared reCAPTCHA key's allowlist, and reCAPTCHA scores inside WebViews are
 * unreliable. So native apps attest with Play Integrity / App Attest through
 * @capacitor-firebase/app-check, and the JS SDK receives that token via a CustomProvider.
 * registerAppCheck() and the recovery logic in app-check.ts are unaffected: they only see the JS
 * AppCheck instance.
 */
export interface AppCheckProviderOptions {
  production: boolean;
  recaptchaEnterpriseKey: string;
  /** environment.services.appcheckDebugToken — the fixed WEB debug token. */
  debugToken?: string;
}

export interface AppCheckProviderChoice {
  platform: 'web' | 'native';
  provider: ReCaptchaEnterpriseProvider | CustomProvider;
  /**
   * Value for window.FIREBASE_APPCHECK_DEBUG_TOKEN, or undefined to leave it unset. Always
   * undefined on native: a JS debug token makes the SDK bypass the provider, so the native
   * attestation would silently never run.
   */
  webDebugToken?: string | true;
}

/** Used when the native SDK reports no expiry. The JS SDK needs one to schedule its refresh. */
const FALLBACK_TOKEN_LIFETIME_MS = 30 * 60_000;

export function chooseAppCheckProvider(options: AppCheckProviderOptions): AppCheckProviderChoice {
  if (Capacitor.isNativePlatform()) {
    return {
      platform: 'native',
      provider: new CustomProvider({ getToken: () => getNativeAppCheckToken(!options.production) }),
    };
  }
  return {
    platform: 'web',
    provider: new ReCaptchaEnterpriseProvider(options.recaptchaEnterpriseKey),
    webDebugToken: options.production ? undefined : (options.debugToken || true),
  };
}

let nativePlugin: Promise<typeof import('@capacitor-firebase/app-check')> | undefined;
let nativeInit: Promise<void> | undefined;

/**
 * Token from the native App Check SDK. The plugin is imported lazily (once, shared by concurrent
 * callers), so web bundles never load it. Initialisation is shared too, and a failed one is
 * forgotten so the next call retries instead of replaying the rejection.
 */
export async function getNativeAppCheckToken(debug: boolean): Promise<{ token: string; expireTimeMillis: number }> {
  nativePlugin ??= import('@capacitor-firebase/app-check');
  const { FirebaseAppCheck } = await nativePlugin;
  nativeInit ??= FirebaseAppCheck.initialize({ debugToken: debug, isTokenAutoRefreshEnabled: true })
    .catch((ex: unknown) => {
      nativeInit = undefined;
      throw ex;
    });
  await nativeInit;
  const result = await FirebaseAppCheck.getToken();
  return {
    token: result.token,
    expireTimeMillis: result.expireTimeMillis ?? Date.now() + FALLBACK_TOKEN_LIFETIME_MS,
  };
}

/** Test-only: forget the shared native initialisation. */
export function resetNativeAppCheckForTests(): void {
  nativePlugin = undefined;
  nativeInit = undefined;
}
