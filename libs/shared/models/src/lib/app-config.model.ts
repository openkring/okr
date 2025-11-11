/* this model is used to read the config data from the database
   the data is then made available to the application via the AppStore
   firebase config as well as API credentials are stored in the environment files, read by set-env.js during build and written into the environment.ts file
   tenantId is used as the key to query the correct app-specific configuration document from the database
*/

import { DEFAULT_EMAIL, DEFAULT_NAME, DEFAULT_TITLE, DEFAULT_URL } from "@bk2/shared-constants";

export type PrivacyAccessor = 'admin' | 'privileged' | 'registered' | 'public';

export interface PrivacySettings {
  showName: PrivacyAccessor;
  showDateOfBirth: PrivacyAccessor;
  showDateOfDeath: PrivacyAccessor;
  showEmail: PrivacyAccessor;
  showPhone: PrivacyAccessor;
  showPostalAddress: PrivacyAccessor;
  showIban: PrivacyAccessor;
  showGender: PrivacyAccessor;
  showTaxId: PrivacyAccessor;
  showBexioId: PrivacyAccessor;
  showTags: PrivacyAccessor;
  showNotes: PrivacyAccessor;
  showMemberships: PrivacyAccessor;
  showOwnerships: PrivacyAccessor;
  showComments: PrivacyAccessor;
  showDocuments: PrivacyAccessor;
}
export class AppConfig {
  public tenantId = ''; // tenant ID, must be identical to the docId of the AppConfig document, is set automatically
  public isArchived = false;
  public description = '';

  // application information
  public appName = DEFAULT_NAME; // name of the application
  public appTitle = DEFAULT_TITLE; // title of the application on Welcome Screen
  public appSubtitle = DEFAULT_TITLE; // subtitle of the application on Welcome Screen
  public appVersion = ''; // version of the application
  public appDomain = ''; // domain of the application, e.g. example.com
  public rootUrl = '/public/welcome';
  public logoUrl = DEFAULT_URL;
  public welcomeBannerUrl = DEFAULT_URL;
  public notfoundBannerUrl = DEFAULT_URL;
  public osiLogoUrl = 'logo/general/osi.svg';

  // authentication URLs
  public loginUrl = '/auth/login';
  public passwordResetUrl = '/auth/pwdreset';

  // i18n settings
  public locale = 'de-ch'; // default locale for the application

  // git repository information
  public gitRepo = DEFAULT_NAME; //  git repository name
  public gitOrg = DEFAULT_NAME; // git organization name
  public issueUrl = DEFAULT_URL; // URL for issues in the git repository

  // operator information
  public opName = DEFAULT_NAME; // name of operator
  public opEmail = DEFAULT_EMAIL; // email address of operator
  public opZipCode = ''; // zip code of operator
  public opCity = ''; // city of operator
  public opStreet = ''; // street of operator
  public opCountryCode = ''; // country of operator
  public opWebUrl = DEFAULT_URL; // website URL of operator

  // owner and default models
  public ownerUserId = ''; // user ID of the owner of the application
  public ownerOrgId = ''; // organization ID of the owner of the application
  public ownerLocationId = ''; // location ID of the owner of the application
  public defaultResourceId = ''; // default resource ID for the application

  // privacy settings
  public dpoEmail = DEFAULT_EMAIL; // email address for DPO contact
  public dpoName = DEFAULT_NAME; // name of the DPO
  public showName: PrivacyAccessor = 'public';
  public showDateOfBirth: PrivacyAccessor = 'registered';
  public showDateOfDeath: PrivacyAccessor = 'privileged';
  public showEmail: PrivacyAccessor = 'registered';
  public showPhone: PrivacyAccessor = 'registered';
  public showPostalAddress: PrivacyAccessor = 'registered';
  public showIban: PrivacyAccessor = 'privileged';
  public showGender: PrivacyAccessor = 'privileged';
  public showTaxId: PrivacyAccessor = 'privileged';
  public showBexioId: PrivacyAccessor = 'privileged';
  public showTags: PrivacyAccessor = 'privileged';
  public showNotes: PrivacyAccessor = 'admin';
  public showMemberships: PrivacyAccessor = 'privileged';
  public showOwnerships: PrivacyAccessor = 'privileged';
  public showComments: PrivacyAccessor = 'privileged';
  public showDocuments: PrivacyAccessor = 'privileged';

  // settings defaults
  public avatarUsage = 3;
  public invoiceDelivery = 1;
  public maxYear = 2050; // maximum year for date inputs
  public minYear = 1850; // minimum year for date inputs
  public nameDisplay = 0; // name display format, e.g. 0 for full name, 1 for first name only
  public newsDelivery = 2; // news delivery preference, e.g. 0 for no news, 1 for email, 2 for in-app
  public personSortCriteria = 1; // sorting criteria for persons, e.g. 0 for name, 1 for date of birth
  public showArchivedData = false; // whether to show archived data
  public showDebugInfo = false; // whether to show debug information
  public useFaceId = false; // whether to use Face ID for authentication
  public useTouchId = false; // whether to use Touch ID for authentication

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.logoUrl = `tenant/${tenantId}/logo/logo_round.svg`;
    this.welcomeBannerUrl = `tenant/${tenantId}/app/welcome.jpg`;
    this.notfoundBannerUrl = `tenant/${tenantId}/app/not-found.jpg`;
    this.ownerUserId = `owner_${tenantId}`;
    this.ownerOrgId = tenantId;
    this.ownerLocationId = `${tenantId}`;
    this.defaultResourceId = `${tenantId}_default`;
    this.issueUrl = `https://github.com/${this.gitOrg}/${this.gitRepo}/issues/new`;
  }
}

export const AppConfigCollection = 'app-config';
