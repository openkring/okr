import { InjectionToken } from "@angular/core";

export interface BkEnvironment {
  production: boolean;
  useEmulators: boolean;
  tenantId: string;
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
    chatStreamApiKey: string;
    appcheckRecaptchaEnterpriseKey: string;
    gmapKey: string;
    nxCloudAccessToken: string;
    imgixBaseUrl: string; 
  }
}

export const ENV = new InjectionToken<BkEnvironment>('environment');