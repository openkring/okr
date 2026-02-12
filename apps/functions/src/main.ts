import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express, { Express } from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Replication from './replication';
import * as Stream from './stream';
import * as Auth from './auth';
import * as Fcm from './fcm';

// firebase app hosting requires a webserver. It does not automatically discover exported functions.
//      the webserver is started in apphosting.yaml
//      nx build functions; firebase deploy  
//      the functions are available under https://<your-project-id>.web.app/echo
// firebase emulator and traditional firebase deploy --only functions automatically discover exported functions.
//      for local development:   firebase emulators:start --only functions

// in AppHosting, we start an Express server
const app: Express = express();

// Enable CORS for requests from your local development server and hosting domains
app.use(cors({ 
  origin: [
    'http://localhost:4200',
    'https://scs-app-54aef.web.app',
    'https://scs-app-54aef.firebaseapp.com',
    'https://bkaiser-org.web.app',
    'https://bkaiser-org.firebaseapp.com',
    'https://seeclub.org',
    'https://bkaiser.ch',
    'https://bkaiser.com',
    'https://bkaiser.org',
    'https://p13.ch',
    'https://kwa.ch',
    'https://silcrest7.ch'
  ] 
}));


export { app };

functions.logger.info('[Emulator/Direct] functions are exported directly.');

// auth
export const createCustomToken = Auth.createCustomToken; // uid
export const createFirebaseUser = Auth.createFirebaseUser; // email, password, displayName
export const getUidByEmail = Auth.getUidByEmail;  // email
export const getFirebaseUser = Auth.getFirebaseUser; // uid
export const setPassword = Auth.setPassword; // uid, password
export const updateFirebaseUser = Auth.updateFirebaseUser; // uid, email, displayName, emailVerified, disabled, phone, photoUrl

// replication
export const onAddressChange = Replication.onAddressChange;
export const onResourceChange = Replication.onResourceChange;
export const onPersonChange = Replication.onPersonChange;
export const onOrgChange = Replication.onOrgChange;
export const onGroupChange = Replication.onGroupChange;

// stream
export const getStreamUserToken = Stream.getStreamUserToken;
export const getOtherStreamUserToken = Stream.getOtherStreamUserToken; // uid
export const revokeOtherStreamUserToken = Stream.revokeOtherStreamUserToken; // uid 

export const onUserCreated = Stream.onUserCreated;
export const onUserDeleted = Stream.onUserDeleted;
export const createOtherStreamUser = Stream.createOtherStreamUser; // uid, name, email, image

// fcm (Firebase Cloud Messaging)
export const sendChatNotification = Fcm.sendChatNotification;
export const saveFcmToken = Fcm.saveFcmToken;
export const checkUnreadMessagesScheduled = Fcm.checkUnreadMessagesScheduled;

// test
export const getEcho = Test.getEcho;
export const getIpInfo = Test.getIpInfo;


