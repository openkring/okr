import { InjectionToken } from "@angular/core";

export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin'| 'public' | 'groupAdmin' ;

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
    appcheckRecaptchaEnterpriseKey: string;
    gmapKey: string;
    nxCloudAccessToken: string;
    imgixBaseUrl: string; 
  }
}

export const ENV = new InjectionToken<BkEnvironment>('environment');