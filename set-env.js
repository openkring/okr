import * as fs from 'fs';
import dotenv from 'dotenv';

console.log('Current NODE_ENV:', process.env.NODE_ENV);
console.log('Environment: ', process.env);

// Determine Firebase configuration source
let firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseUrl: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
  appcheckRecaptchaEnterpriseKey: '', // Always from NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY
};
const servicesConfig = {
  gmapKey: '',
  nxCloudAccessToken: ''
}
let usingFirebaseWebappConfig = false;

// If NODE_ENV is 'production', we assume we are in a Firebase App Hosting environment.
// and should rely on environment variables provided by that environment, not a .env file.
if (process.env.NODE_ENV === 'production') {
  console.log('NODE_ENV is "production", assuming deployed environment. Skipping .env load, trying to read FIREBASE_WEBAPP_CONFIG.');
  if (process.env.FIREBASE_WEBAPP_CONFIG) {
    try {
      const fbWebConfig = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG);
      if (fbWebConfig.apiKey && fbWebConfig.projectId && fbWebConfig.appId) { // Basic validation
        firebaseConfig = {
          apiKey: fbWebConfig.apiKey || '',
          authDomain: fbWebConfig.authDomain || '',
          projectId: fbWebConfig.projectId || '',
          storageBucket: fbWebConfig.storageBucket || '',
          messagingSenderId: fbWebConfig.messagingSenderId || '',
          appId: fbWebConfig.appId || '',
          measurementId: fbWebConfig.measurementId || '',
        };
        usingFirebaseWebappConfig = true;
        console.log('Successfully parsed and will use FIREBASE_WEBAPP_CONFIG for Firebase settings.');
      } else {
        console.warn('FIREBASE_WEBAPP_CONFIG was present but did not contain expected primary keys (apiKey, projectId, appId). Falling back to individual env vars for Firebase.');
      }
    } catch (e) {
      console.error('Error parsing FIREBASE_WEBAPP_CONFIG. Will rely on individual env vars for Firebase.', e);
    }
  } else {
    console.log('FIREBASE_WEBAPP_CONFIG not found in production. Will rely on individual NEXT_PUBLIC_FIREBASE_* env vars.');
  }
} else {
  console.log('NODE_ENV is not production (' + process.env.NODE_ENV + '), assuming local or CI. Loading .env.');
  dotenv.config(); // load environment variables from .env file
}

// Fallback or local development: Populate from individual NEXT_PUBLIC_FIREBASE_* if FIREBASE_WEBAPP_CONFIG wasn't used
if (!usingFirebaseWebappConfig) {
  console.log('Populating Firebase config from individual NEXT_PUBLIC_FIREBASE_* environment variables.');
  firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
  };
}

// config parameters that are always sourced from the env
firebaseConfig.appcheckRecaptchaEnterpriseKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY || '';
servicesConfig.gmapKey = process.env.NEXT_PUBLIC_SVC_GMAP_KEY || '';
servicesConfig.nxCloudAccessToken = process.env.NEXT_PUBLIC_NX_CLOUD_ACCESS_TOKEN || '';

const writeFile = fs.writeFile;

// Get the project name from Nx environment variable
const projectName = process.env.NX_TASK_TARGET_PROJECT;

if (!projectName) {
  console.error('ERROR: NX_TASK_TARGET_PROJECT is not defined. This script expects to be run by Nx.');
  process.exit(1);
}
const envPath = `./apps/${projectName}/src/environments/environment.ts`;
const envProdPath = `./apps/${projectName}/src/environments/environment.prod.ts`;
const tenantId = projectName.replace(/-app$/, '');

// Enhanced check for required environment variables
const ALWAYS_REQUIRED_PROCESS_ENV_VARS = [
  'NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY', // Because it's sourced directly
  'NEXT_PUBLIC_NX_CLOUD_ACCESS_TOKEN',
  'NEXT_PUBLIC_SVC_GMAP_KEY'
  // Add other non-Firebase essential process.env vars here
];

const FIREBASE_FALLBACK_PROCESS_ENV_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  // 'NEXT_PUBLIC_FIREBASE_APP_ID' // Often optional or might not be in .env by default
];

function checkRequiredSettings() {
  let missingVars = ALWAYS_REQUIRED_PROCESS_ENV_VARS.filter(varName => !process.env[varName]);
  const errors = [];

  if (usingFirebaseWebappConfig) {
    if (!firebaseConfig.apiKey) errors.push('apiKey (from parsed FIREBASE_WEBAPP_CONFIG)');
    if (!firebaseConfig.projectId) errors.push('projectId (from parsed FIREBASE_WEBAPP_CONFIG)');
    // Add checks for other essential fields from firebaseConfig if their absence is critical
  } else {
    // If not using webapp config, then all individual Firebase vars are required from process.env
    missingVars = missingVars.concat(FIREBASE_FALLBACK_PROCESS_ENV_VARS.filter(varName => !process.env[varName]));
  }

  missingVars.forEach(varName => errors.push(`${varName} (from process.env)`));

  if (errors.length > 0) {
    console.error('ERROR: The following required environment variables/config values are not defined or missing:');
    errors.forEach(varName => console.error(`- ${varName}`));
    console.error('Please ensure these are set in your .env file (for local) or as secrets in your hosting environment.');
    process.exit(1);
  }
  console.log('All required environment variables/config values appear to be present.');
}

checkRequiredSettings();

function generateEnvFileContent(isProduction) {
  return `
    import {BkEnvironment} from '@bk2/shared/config';
  
    export const environment: BkEnvironment = {
      production: ${isProduction},
      useEmulators: false, // Assuming emulators are not used in generated files by this script
      tenantId: ${tenantId},
      firebase: {
        apiKey: '${firebaseConfig.apiKey}',
        authDomain: '${firebaseConfig.authDomain}',
        projectId: '${firebaseConfig.projectId}',
        storageBucket: '${firebaseConfig.storageBucket}',
        messagingSenderId: '${firebaseConfig.messagingSenderId}',
        appId: '${firebaseConfig.appId}',
        measurementId: '${firebaseConfig.measurementId}',
        appcheckRecaptchaEnterpriseKey: '${firebaseConfig.appcheckRecaptchaEnterpriseKey}'
        },
      services: {
        gmapKey: '${process.env['NEXT_PUBLIC_SVC_GMAP_KEY']}',
        nxCloudAccessToken: '${process.env['NEXT_PUBLIC_NX_CLOUD_ACCESS_TOKEN']}'
      }
    };
  `;
}

// Generate environment.ts
const envFileContent = generateEnvFileContent(false);
writeFile(envPath, envFileContent, (err) => {
  if (err) {
    console.error(`Angular environment.ts file could not be generated at ${envPath}.`);
    console.error(err);
    throw err;
  } else {
    console.log(`Angular environment.ts file generated correctly at ${envPath}`);
  }
});

// Generate environment.prod.ts
const prodEnvFileContent = generateEnvFileContent(true);
writeFile(envProdPath, prodEnvFileContent, (err) => {
  if (err) {
    console.error(`Angular environment.prod.ts file could not be generated at ${envProdPath}.`);
    console.error(err);
    throw err;
  } else {
    console.log(`Angular environment.prod.ts file generated correctly at ${envProdPath}`);
  }
});

console.log('Environment file generation process complete.');
