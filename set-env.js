import dotenv from 'dotenv';
import * as fs from 'fs';

// Determine Firebase configuration source
let firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
};
const servicesConfig = {
  appcheckRecaptchaEnterpriseKey: '', // Always from NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY
  gmapKey: '',
  nxCloudAccessToken: '',
  imgixBaseUrl: '',
};

// load firebase configuration from FIREBASE_WEBAPP_CONFIG if available
if (process.env.FIREBASE_WEBAPP_CONFIG) {
  try {
    const _rawConfig = process.env.FIREBASE_WEBAPP_CONFIG;
    let _correctedConfig = ''; // Initialize for catch block scope

    // FIREBASE_WEBAPP_CONFIG is in relaxed JSON format, we need to correct it
    // Add quotes around keys: handles patterns like {key: "value"} or ,key:"value"
    // It looks for an opening brace or a comma, followed by optional whitespace,
    // then an unquoted key (starts with a letter or underscore, followed by alphanumeric or underscore),
    // followed by optional whitespace and a colon.
    _correctedConfig = _rawConfig.replace(/({\s*|,\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
    const _fbWebConfig = JSON.parse(_correctedConfig);

    if (_fbWebConfig.apiKey && _fbWebConfig.projectId && _fbWebConfig.appId) {
      // Basic validation
      firebaseConfig = {
        apiKey: _fbWebConfig.apiKey || '',
        authDomain: _fbWebConfig.authDomain || '',
        projectId: _fbWebConfig.projectId || '',
        storageBucket: _fbWebConfig.storageBucket || '',
        messagingSenderId: _fbWebConfig.messagingSenderId || '',
        appId: _fbWebConfig.appId || '',
        measurementId: _fbWebConfig.measurementId || '',
      };
      console.log('Successfully parsed and will use FIREBASE_WEBAPP_CONFIG for Firebase settings.');
    } else {
      console.error('FIREBASE_WEBAPP_CONFIG was present but did not contain expected primary keys (apiKey, projectId, appId).');
      process.exit(1);
    }
  } catch (e) {
    console.error('Error parsing FIREBASE_WEBAPP_CONFIG. ', e);
    process.exit(1);
  }
} else {
  console.log('FIREBASE_WEBAPP_CONFIG not found.');
  process.exit(1);
}

// Get the project name from Nx environment variable
const projectName = process.env.NX_TASK_TARGET_PROJECT;

if (!projectName) {
  console.error('ERROR: NX_TASK_TARGET_PROJECT is not defined. This script expects to be run by Nx.');
  process.exit(1);
}

// Load .env file from the specific app directory first, then fallback to root
// This allows app-specific configuration to override workspace defaults
const appEnvPath = `./apps/${projectName}/.env`;
const rootEnvPath = './.env';

// Try to load app-specific .env first
if (fs.existsSync(appEnvPath)) {
  console.log(`Loading app-specific .env from ${appEnvPath}`);
  dotenv.config({ path: appEnvPath });
} else {
  console.log(`No app-specific .env found at ${appEnvPath}, trying root .env`);
  dotenv.config({ path: rootEnvPath });
}

if (process.env.NODE_ENV === 'production') {
  console.log('NODE_ENV=production, assuming deployed environment. Skipping .env load for variables, but used for module resolution. Trying to read injected FIREBASE_WEBAPP_CONFIG.');
} else {
  console.log('NODE_ENV!=production (' + process.env.NODE_ENV + '), assuming local or CI. Loading .env for variables.');
}

// load service configuration from separate environment variables
servicesConfig.appcheckRecaptchaEnterpriseKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY || '';
servicesConfig.gmapKey = process.env.NEXT_PUBLIC_SVC_GMAP_KEY || '';
servicesConfig.nxCloudAccessToken = process.env.NEXT_PUBLIC_NX_CLOUD_ACCESS_TOKEN || '';
servicesConfig.imgixBaseUrl = process.env.NEXT_PUBLIC_IMGIX_BASE_URL || '';

const writeFile = fs.writeFile;

const envPath = `./apps/${projectName}/src/environments/environment.ts`;
const tenantId = projectName.replace(/-app$/, '');

function checkRequiredSettings() {
  const errors = [];
  if (!firebaseConfig.apiKey) errors.push('apiKey (from parsed FIREBASE_WEBAPP_CONFIG)');
  if (!firebaseConfig.authDomain) errors.push('authDomain (from parsed FIREBASE_WEBAPP_CONFIG)');
  if (!firebaseConfig.projectId) errors.push('projectId (from parsed FIREBASE_WEBAPP_CONFIG)');
  if (!firebaseConfig.storageBucket) errors.push('storageBucket (from parsed FIREBASE_WEBAPP_CONFIG)');
  if (!firebaseConfig.messagingSenderId) errors.push('messagingSenderId (from parsed FIREBASE_WEBAPP_CONFIG)');
  if (!firebaseConfig.appId) errors.push('appId (from parsed FIREBASE_WEBAPP_CONFIG)');
  if (!tenantId) errors.push('tenantId (derived from NX_TASK_TARGET_PROJECT)');
  if (!servicesConfig.appcheckRecaptchaEnterpriseKey) errors.push('appcheckRecaptchaEnterpriseKey (from NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY)');
  if (!servicesConfig.gmapKey) errors.push('gmapKey (from NEXT_PUBLIC_SVC_GMAP_KEY)');
  if (!servicesConfig.nxCloudAccessToken) errors.push('nxCloudAccessToken (from NEXT_PUBLIC_NX_CLOUD_ACCESS_TOKEN)');
  if (!servicesConfig.imgixBaseUrl) errors.push('imgixBaseUrl (from NEXT_PUBLIC_IMGIX_BASE_URL)');
  // Add checks for other essential fields from firebaseConfig if their absence is critical

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
  const _timestamp = new Date().toISOString();
  return `// This file was automatically generated by set-env.js on ${_timestamp}. Do not edit manually.
import { BkEnvironment } from '@bk2/shared-config';

export const environment: BkEnvironment = {
  production: ${isProduction},
  useEmulators: false,
  tenantId: '${tenantId}',
  firebase: {
    apiKey: '${firebaseConfig.apiKey}',
    authDomain: '${firebaseConfig.authDomain}',
    projectId: '${firebaseConfig.projectId}',
    storageBucket: '${firebaseConfig.storageBucket}',
    messagingSenderId: '${firebaseConfig.messagingSenderId}',
    appId: '${firebaseConfig.appId}',
    measurementId: '${firebaseConfig.measurementId}',
  },
  services: {
    matrixHomeserver: 'https://matrix.bkchat.etke.host',
    appcheckRecaptchaEnterpriseKey: '${servicesConfig.appcheckRecaptchaEnterpriseKey}',
    gmapKey: '${servicesConfig.gmapKey}',
    nxCloudAccessToken: '${servicesConfig.nxCloudAccessToken}',
    imgixBaseUrl: '${servicesConfig.imgixBaseUrl}',
  },
};
`;
}

function generateFirebaseConfigJS() {
  const _timestamp = new Date().toISOString();
  return `// This file was automatically generated by set-env.js on ${_timestamp}. Do not edit manually.
// Firebase configuration for service worker
const firebaseConfig = {
  apiKey: '${firebaseConfig.apiKey}',
  authDomain: '${firebaseConfig.authDomain}',
  projectId: '${firebaseConfig.projectId}',
  storageBucket: '${firebaseConfig.storageBucket}',
  messagingSenderId: '${firebaseConfig.messagingSenderId}',
  appId: '${firebaseConfig.appId}',
  measurementId: '${firebaseConfig.measurementId}',
};
`;
}

// Generate environment.ts
const envFileContent = generateEnvFileContent(process.env.NODE_ENV === 'production');
writeFile(envPath, envFileContent, err => {
  if (err) {
    console.error(`Angular environment.ts file could not be generated at ${envPath}.`);
    console.error(err);
    throw err;
  } else {
    console.log(`Angular environment.ts file generated correctly at ${envPath}`);
  }
});

// Generate firebase-config.js for service worker
const firebaseConfigPath = `./apps/${projectName}/src/firebase-config.js`;
const firebaseConfigContent = generateFirebaseConfigJS();
writeFile(firebaseConfigPath, firebaseConfigContent, err => {
  if (err) {
    console.error(`Firebase config file could not be generated at ${firebaseConfigPath}.`);
    console.error(err);
    throw err;
  } else {
    console.log(`Firebase config file generated correctly at ${firebaseConfigPath}`);
  }
});

console.log('Environment file generation process complete.');
