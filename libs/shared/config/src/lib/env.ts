import { InjectionToken } from "@angular/core";

export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin'| 'public' | 'groupAdmin' ;

export interface BkEnvironment {
  production: boolean;
  useEmulators: boolean;
  firebase: {       // the firebase configuration (see firebase console)
    apiKey: string;
    authDomain: string;
    databaseUrl: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
    appcheckRecaptchaEnterpriseKey: string;
  },
  app: {
    title: string;      // freetext to describe the app
    subTitle: string;   // freetext to describe the app
    name: string;    // the name of the app as shown in the Firebase console (normally, this is the same as the tenantId)
    version: string;      // the version of the app
    domain: string;       // the web domain where the app is hosted e.g. https://www.example.com
    imgixBaseUrl: string;   // the base url for imgix images, i.e. the imgix source url
    rootUrl: string;      // the main url of the app e.g.  public/welcome
    logoUrl: string;      // the url of the logo image of the app (typically a relative url into the Firebase storage)
    welcomeBannerUrl: string;   // the url of the welcome banner image of the app (typically a relative url into the Firebase storage)
    notfoundBannerUrl: string;  // the url of the notfound banner image of the app (typically a relative url into the Firebase storage)
    osiLogoUrl: string;   // the url of the open source initiative logo image of the app (typically a relative url into the Firebase storage)
  },
  owner: {
    tenantId: string;   // the id of the main tenant, e.g. p13;  implicitly, there is an org with the same id 
    orgId: string;  // the organization that owns the app; usually, this is the same as the tenantId, e.g. p13
    repId: string;      // the user representing the owner org; normally, this is also the userId of the admin, e.g. owner_p13
    locationId: string; // the location of the owner org, e.g. loc_p13
    latitude: string;   // the latitude of the location of the owner org
    longitude: string;  // the longitude of the location of the owner org
    zoom: string;       // the zoom level of the location of the owner org in Google Maps
  },
  auth: {
    loginUrl: string;
    passwordResetUrl: string;
  },
  chat: {
    apiKey: string;
    appSecret: string;
    userToken: string; // only for testing purposes; should be generated on the server
  },
  thumbnail: {
    width: number;
    height: number;
  },
  privacy: {
    dpo_email: string;
    dpo_name: string;
    showDateOfBirth: RoleName;
    showDateOfDeath: RoleName;
    showGender: RoleName;
    showTaxId: RoleName;
    showBexioId: RoleName;
    showTags: RoleName;
    showNotes: RoleName;
    showMemberships: RoleName;
    showOwnerships: RoleName;
    showComments: RoleName;
    showDocuments: RoleName;
  },
  git: {
    repo: string;
    org: string;
    issueUrl: string;
  },
  services: {
    gmapKey: string;
  },
  i18n: {
    locale: string;
  },
  operator: {
    name: string;
    street: string;
    zipcode: string;
    city: string;
    email: string;
    web: string;
  },
  settingsDefaults: {
    avatarUsage: number;
    gravatarEmail: string;
    invoiceDelivery: number;
    maxYear: number;
    minYear: number;
    nameDisplay: number;
    newsDelivery: number;
    personSortCriteria: number;
    showArchivedData: boolean;
    showDebugInfo: boolean;
    showTestData: boolean;
    toastLength: number;
    useFaceId: boolean;
    useTouchId: boolean;
    defaultResource: string
  }
}

export const ENV = new InjectionToken<BkEnvironment>('environment');