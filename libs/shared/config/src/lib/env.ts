import { InjectionToken } from "@angular/core";

export interface OkrEnvironment {
  production: boolean;
  useEmulators: boolean;
  tenantId: string;
  appId: string; // human-readable app identifier for per-app branding (e.g. 'scs', 'test')
  firebase: {       
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  },
  services: {
    matrixHomeserver: string;
    appcheckRecaptchaEnterpriseKey: string;
    gmapKey: string;
    nxCloudAccessToken: string;
    imgixBaseUrl: string;
    fcmVapidKey?: string; // Web Push VAPID key (Firebase Console → Project Settings → Cloud Messaging)
    /**
     * Fixed App Check debug token for local development, from FIREBASE_APPCHECK_DEBUG_TOKEN
     * in the app's git-ignored .env. Without it the SDK mints a RANDOM token per browser
     * profile and stores it in IndexedDB — clearing site data or switching profile silently
     * invalidates it, and every Firestore listener starts failing with "Missing or
     * insufficient permissions". Register the fixed token once under App Check → Manage
     * debug tokens and it survives all of that.
     *
     * `set-env.js` writes this ONLY for development builds. A production bundle carrying a
     * debug token would be an App Check bypass shipped to every user.
     */
    appcheckDebugToken?: string;
  },
  sentry?: {
    dsn: string;                                        // EU (DE) project DSN, e.g. https://...ingest.de.sentry.io/...
    environment: 'development' | 'staging' | 'production';
    release: string;                                    // '<tenantId>@<package.json version>'
    tracesSampleRate: number;                           // 0 in dev, 0.1 in prod
    enabled: boolean;                                   // false in dev / when no DSN
  }
}

export const ENV = new InjectionToken<OkrEnvironment>('environment');
