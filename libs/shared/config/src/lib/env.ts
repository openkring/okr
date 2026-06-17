import { InjectionToken } from "@angular/core";

export interface BkEnvironment {
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
  },
  sentry?: {
    dsn: string;                                        // EU (DE) project DSN, e.g. https://...ingest.de.sentry.io/...
    environment: 'development' | 'staging' | 'production';
    release: string;                                    // '<tenantId>@<package.json version>'
    tracesSampleRate: number;                           // 0 in dev, 0.1 in prod
    enabled: boolean;                                   // false in dev / when no DSN
  }
}

export const ENV = new InjectionToken<BkEnvironment>('environment');