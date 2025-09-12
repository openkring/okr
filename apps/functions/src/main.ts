import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Replication from './replication';
import * as Stream from './stream';
import * as Auth from './auth';

// firebase app hosting requires a webserver. It does not automatically discover exported functions.
//      the webserver is started in apphosting.yaml
//      nx build functions; firebase deploy  
//      the functions are available under https://<your-project-id>.web.app/echo
// firebase emulator and traditional firebase deploy --only functions automatically discover exported functions.
//      for local development:   firebase emulators:start --only functions

// in AppHosting, we start an Express server
const app = express();

// Enable CORS for requests from your local development server
app.use(cors({ origin: 'http://localhost:4200' }));


export { app };

functions.logger.info('[Emulator/Direct] functions are exported directly.');

export const getEcho = Test.getEcho;
export const getIpInfo = Test.getIpInfo;

export const onPersonAddressChange = Replication.onPersonAddressChange;
export const onOrgAddressChange = Replication.onOrgAddressChange;
export const onResourceChange = Replication.onResourceChange;
export const onPersonChange = Replication.onPersonChange;
export const onOrgChange = Replication.onOrgChange;
export const onGroupChange = Replication.onGroupChange;

export const getStreamUserToken = Stream.getStreamUserToken;
export const getOtherStreamUserToken = Stream.getOtherStreamUserToken; // uid
export const revokeOtherStreamUserToken = Stream.revokeOtherStreamUserToken; // uid 

export const onUserCreated = Stream.onUserCreated;
export const onUserDeleted = Stream.onUserDeleted;
export const createOtherStreamUser = Stream.createOtherStreamUser; // uid, name, email, image
export const impersonateUser = Auth.impersonateUser; // uid
