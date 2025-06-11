import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config(); // load environment variables from .env file
const writeFile = fs.writeFile;

// Get the project name from Nx environment variable
const projectName = process.env.NX_TASK_TARGET_PROJECT;

if (!projectName) {
  console.error('ERROR: NX_TASK_TARGET_PROJECT is not defined. This script expects to be run by Nx.');
  console.error('Current process.env:', process.env);
  process.exit(1);
}
const envPath = `./apps/${projectName}/src/environments/environment.ts`;
const envProdPath = `./apps/${projectName}/src/environments/environment.prod.ts`;
const tenantId = projectName.replace(/-app$/, '');

// Define required environment variables for the script to function
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_APP_TITLE',
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_CHAT_API_KEY'
];

function checkRequiredEnvVars() {
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('ERROR: The following required environment variables are not defined:');
    missingVars.forEach(varName => console.error(`- ${varName}`));
    console.error('Please ensure these secrets are set in Firebase App Hosting and available to the build environment.');
    console.error('Current process.env.NEXT_PUBLIC_AUTH_TENANTID:', process.env['NEXT_PUBLIC_AUTH_TENANTID']);
    process.exit(1); // Exit with an error code
  }
  console.log('All required environment variables are present.');
}

// Perform checks before proceeding
checkRequiredEnvVars();


export const setEnv = () => {
  const envConfigFile = `
  import {BkEnvironment} from '@bk2/shared/config';

  export const environment: BkEnvironment = {
    production: false,
    useEmulators: false,
    firebase: {
      apiKey: '${process.env['NEXT_PUBLIC_FIREBASE_API_KEY']}',
      authDomain: '${process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN']}',
      databaseUrl: '${process.env['NEXT_PUBLIC_FIREBASE_DATABASE_URL']}',
      projectId: '${process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID']}',
      storageBucket: '${process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET']}',
      messagingSenderId: '${process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID']}',
      appId: '${process.env['NEXT_PUBLIC_FIREBASE_APP_ID']}',
      measurementId: '${process.env['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID']}',
      appcheckRecaptchaEnterpriseKey: '${process.env['NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY']}'
    },
    app: {
      title: '${process.env['NEXT_PUBLIC_APP_TITLE']}',
      subTitle: '${process.env['NEXT_PUBLIC_APP_SUBTITLE']}',
      name: '${process.env['NEXT_PUBLIC_APP_NAME']}',
      version: '${process.env['NEXT_PUBLIC_APP_VERSION']}',
      domain: '${process.env['NEXT_PUBLIC_APP_DOMAIN']}',
      imgixBaseUrl: '${process.env['NEXT_PUBLIC_APP_IMGIX_BASE_URL']}',
      rootUrl: '/public/welcome',
      logoUrl: 'tenant/${tenantId}/logo/logo_round.svg',
      welcomeBannerUrl: 'tenant/${tenantId}/app/welcome.jpg',
      notfoundBannerUrl: 'tenant/${tenantId}/app/not-found.jpg',
      osiLogoUrl: 'logo/general/osi.svg'
    },
    owner: {
      tenantId: '${tenantId}',
      orgId: '${tenantId}',
      repId: 'owner_${tenantId}',
      locationId: 'loc_${tenantId}',
      latitude: '${process.env['NEXT_PUBLIC_APP_LATITUDE']}',
      longitude: '${process.env['NEXT_PUBLIC_APP_LONGITUDE']}',
      zoom: '${process.env['NEXT_PUBLIC_APP_ZOOM']}'
    },
    auth: {
      loginUrl: '/auth/login',
      passwordResetUrl: '/auth/pwdreset',
    },
    chat: {
      apiKey: '${process.env['NEXT_PUBLIC_CHAT_API_KEY']}',
      appSecret: '${process.env['NEXT_PUBLIC_CHAT_APP_SECRET']}',
      userToken: ''
    },
    thumbnail: {
      width: 200,
      height: 300
    },
    privacy: {
      dpo_email: '${process.env['NEXT_PUBLIC_DPO_EMAIL']}',
      dpo_name: '${process.env['NEXT_PUBLIC_DPO_NAME']}',
      showDateOfBirth: 'admin',
      showDateOfDeath: 'admin',
      showGender: 'admin',
      showTaxId: 'admin',
      showBexioId: 'admin',
      showTags: 'admin',
      showNotes: 'admin',
      showMemberships: 'admin',
      showOwnerships: 'admin',
      showComments: 'admin',
      showDocuments: 'admin'
    },
    git: {
      repo: '${process.env['NEXT_PUBLIC_GIT_REPO']}',
      org: '${process.env['NEXT_PUBLIC_GIT_ORG']}',
      issueUrl: 'https://github.com/${process.env['NEXT_PUBLIC_GIT_ORG']}/${process.env['NEXT_PUBLIC_GIT_REPO']}/issues/new'
    },
    services: {
      gmapKey: '${process.env['NEXT_PUBLIC_SVC_GMAP_KEY']}'
    },
    i18n: {
      locale: 'de-ch'
    },
    operator: {
      name: '${process.env['NEXT_PUBLIC_OP_NAME']}',
      street: '${process.env['NEXT_PUBLIC_OP_STREET']}',
      zipcode: '${process.env['NEXT_PUBLIC_OP_ZIP']}',
      city: '${process.env['NEXT_PUBLIC_OP_CITY']}',
      email: '${process.env['NEXT_PUBLIC_OP_EMAIL']}',
      web: '${process.env['NEXT_PUBLIC_OP_WEB']}'
    },
    settingsDefaults: {
      avatarUsage: 3,
      gravatarEmail: '',
      invoiceDelivery: 1,
      maxYear: 2050,
      minYear: 1850,
      nameDisplay: 0,
      newsDelivery: 2,
      personSortCriteria: 1,
      showArchivedData: false,
      showDebugInfo: false,
      showTestData: false,
      toastLength: 3000,
      useFaceId: false,
      useTouchId: false,
      defaultResource: '${tenantId}_default',
    }
  };
`;
  writeFile(envPath, envConfigFile, (err) => {
    if (err) {
      console.error(`Angular environment.ts file could not be generated at ${envPath}.`);
      console.error(err);
      throw err;
    } else {
      console.log(`Angular environment.ts file generated correctly at ${envPath} 
`);
    }
  });
};

export const setProdEnv = () => {
    const prodEnvConfigFile = `
    import {BkEnvironment} from '@bk2/shared/config';
  
    export const environment: BkEnvironment = {
      production: true,
      useEmulators: false,
      firebase: {
        apiKey: '${process.env['NEXT_PUBLIC_FIREBASE_API_KEY']}',
        authDomain: '${process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN']}',
        databaseUrl: '${process.env['NEXT_PUBLIC_FIREBASE_DATABASE_URL']}',
        projectId: '${process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID']}',
        storageBucket: '${process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET']}',
        messagingSenderId: '${process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID']}',
        appId: '${process.env['NEXT_PUBLIC_FIREBASE_APP_ID']}',
        measurementId: '${process.env['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID']}',
        appcheckRecaptchaEnterpriseKey: '${process.env['NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY']}'
      },
      app: {
      title: '${process.env['NEXT_PUBLIC_APP_TITLE']}',
      subTitle: '${process.env['NEXT_PUBLIC_APP_SUBTITLE']}',
      name: '${process.env['NEXT_PUBLIC_APP_NAME']}',
      version: '${process.env['NEXT_PUBLIC_APP_VERSION']}',
      domain: '${process.env['NEXT_PUBLIC_APP_DOMAIN']}',
      imgixBaseUrl: '${process.env['NEXT_PUBLIC_APP_IMGIX_BASE_URL']}',
      rootUrl: '/public/welcome',
      logoUrl: 'tenant/${tenantId}/logo/logo_round.svg',
      welcomeBannerUrl: 'tenant/${tenantId}/app/welcome.jpg',
      notfoundBannerUrl: 'tenant/${tenantId}/app/not-found.jpg',
      osiLogoUrl: 'logo/general/osi.svg'
      },
      owner: {
        tenantId: '${tenantId}',
        orgId: '${tenantId}',
        repId: 'owner_${tenantId}',
        locationId: 'loc_${tenantId}',
        latitude: '${process.env['NEXT_PUBLIC_APP_LATITUDE']}',
        longitude: '${process.env['NEXT_PUBLIC_APP_LONGITUDE']}',
        zoom: '${process.env['NEXT_PUBLIC_APP_ZOOM']}'
      },
      auth: {
        loginUrl: '/auth/login',
        passwordResetUrl: '/auth/pwdreset',
      },
      chat: {
        apiKey: '${process.env['NEXT_PUBLIC_CHAT_API_KEY']}',
        appSecret: '${process.env['NEXT_PUBLIC_CHAT_APP_SECRET']}',
        userToken: ''
      },
      thumbnail: {
        width: 200,
        height: 300
      },
      privacy: {
        dpo_email: '${process.env['NEXT_PUBLIC_DPO_EMAIL']}',
        dpo_name: '${process.env['NEXT_PUBLIC_DPO_NAME']}',
        showDateOfBirth: 'admin',
        showDateOfDeath: 'admin',
        showGender: 'admin',
        showTaxId: 'admin',
        showBexioId: 'admin',
        showTags: 'admin',
        showNotes: 'admin',
        showMemberships: 'admin',
        showOwnerships: 'admin',
        showComments: 'admin',
        showDocuments: 'admin'
      },
      git: {
        repo: '${process.env['NEXT_PUBLIC_GIT_REPO']}',
        org: '${process.env['NEXT_PUBLIC_GIT_ORG']}',
        issueUrl: 'https://github.com/${process.env['NEXT_PUBLIC_GIT_ORG']}/${process.env['NEXT_PUBLIC_GIT_REPO']}/issues/new'
      },
      services: {
        gmapKey: '${process.env['NEXT_PUBLIC_SVC_GMAP_KEY']}'
      },
      i18n: {
        locale: 'de-ch'
      },
      operator: {
        name: '${process.env['NEXT_PUBLIC_OP_NAME']}',
        street: '${process.env['NEXT_PUBLIC_OP_STREET']}',
        zipcode: '${process.env['NEXT_PUBLIC_OP_ZIP']}',
        city: '${process.env['NEXT_PUBLIC_OP_CITY']}',
        email: '${process.env['NEXT_PUBLIC_OP_EMAIL']}',
        web: '${process.env['NEXT_PUBLIC_OP_WEB']}'
      },
      settingsDefaults: {
        avatarUsage: 3,
        gravatarEmail: '',
        invoiceDelivery: 1,
        maxYear: 2050,
        minYear: 1850,
        nameDisplay: 0,
        newsDelivery: 2,
        personSortCriteria: 1,
        showArchivedData: false,
        showDebugInfo: false,
        showTestData: false,
        toastLength: 3000,
        useFaceId: false,
        useTouchId: false,
        defaultResource: '${tenantId}_default',
      }
    };
  `;
    writeFile(envProdPath, prodEnvConfigFile, (err) => {
      if (err) {
        console.error(`Angular environment.prod.ts file could not be generated at ${envProdPath}.`);
        console.error(err);
        throw err;
      } else {
        console.log(`Angular environment.prod.ts file generated correctly at ${envProdPath} 
`);
      }
    });
  };

setEnv();
setProdEnv();
