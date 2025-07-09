import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express from 'express';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Replication from './replication';
import * as Stream from './stream';

// firebase app hosting requires a webserver. It does not automatically discover exported functions.
//      the webserver is started in apphosting.yaml
//      nx build functions; firebase deploy  
//      the functions are available under https://<your-project-id>.web.app/echo
// firebase emulator and traditional firebase deploy --only functions automatically discover exported functions.
//      for local development:   firebase emulators:start --only functions

// in AppHosting, we start an Express server
const app = express();

// bind the onRequest functions to express routes
app.use('/echo', Test.echoHandler);
app.use('/getIpInfo', Test.getIpInfoHandler);

export { app};

functions.logger.info('[Emulator/Direct] functions are exported directly.');

// onCall functions
export const getStreamUserToken = Stream.getStreamUserToken;
export const revokeStreamUserToken = Stream.revokeStreamUserToken;

// background trigger functions
export const onPersonAddressChange = Replication.onPersonAddressChange;
export const onOrgAddressChange = Replication.onOrgAddressChange;
export const onResourceChange = Replication.onResourceChange;
export const onPersonChange = Replication.onPersonChange;
export const onOrgChange = Replication.onOrgChange;
export const onGroupChange = Replication.onGroupChange;
export const createStreamUser = Stream.createStreamUser;
export const deleteStreamUser = Stream.deleteStreamUser;

