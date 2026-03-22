import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express, { Express } from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Calendar from './calendar';
import * as Replication from './replication';
import * as Auth from './auth';
import * as Matrix from './matrix';
import * as OidcBridge from './oidc-bridge';
import * as MatrixSimple from './matrix-simple';
import * as Rag from './rag';
import * as Email from './email';
import * as Zefix from './zefix';

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
    'http://localhost:4201',
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
export const listFirebaseUsers = Auth.listFirebaseUsers;
export const deleteFirebaseAuthUser = Auth.deleteFirebaseAuthUser;
export const sendEmail = Auth.sendEmail;

// replication
export const onAddressChange = Replication.onAddressChange;
export const onResourceChange = Replication.onResourceChange;
export const onPersonChange = Replication.onPersonChange;
export const onOrgChange = Replication.onOrgChange;
export const onGroupChange = Replication.onGroupChange;

// matrix (Matrix chat integration)
export const ensureMatrixUser = Matrix.ensureMatrixUser;
export const ensureGroupRoom = Matrix.ensureGroupRoom;
export const syncUserProfileToMatrix = Matrix.syncUserProfileToMatrix;

// matrix-simple (Simpler Firebase → Matrix token exchange)
export const getMatrixCredentials = MatrixSimple.getMatrixCredentials;
export const syncFirebaseProfileToMatrix = MatrixSimple.syncFirebaseProfileToMatrix;
export const requestGroupRoomAccess = MatrixSimple.requestGroupRoomAccess;
export const provisionMatrixUser = MatrixSimple.provisionMatrixUser;
export const getRoomByName = MatrixSimple.getRoomByName;
export const renameMatrixRoom = MatrixSimple.renameMatrixRoom;
export const invitePersonToGroupRoom = MatrixSimple.invitePersonToGroupRoom;
export const kickPersonFromGroupRoom = MatrixSimple.kickPersonFromGroupRoom;
export const deleteMatrixRoom = MatrixSimple.deleteMatrixRoom;
export const deactivateMatrixUser = MatrixSimple.deactivateMatrixUser;
export const listMatrixRooms = MatrixSimple.listMatrixRooms;
export const getRoomDetails = MatrixSimple.getRoomDetails;
export const getAllMembersFromRoom = MatrixSimple.getAllMembersFromRoom;
export const getMemberDetails = MatrixSimple.getMemberDetails;
export const addMatrixRoomAlias = MatrixSimple.addMatrixRoomAlias;
export const sendCallNotification = MatrixSimple.sendCallNotification;

// oidc-bridge (Full OIDC Identity Provider for Matrix - Complex but native Matrix SSO)
export const oidcDiscovery = OidcBridge.oidcDiscovery;
export const oidcAuthorize = OidcBridge.oidcAuthorize;
export const oidcCallback = OidcBridge.oidcCallback;
export const oidcExchange = OidcBridge.oidcExchange;
export const oidcToken = OidcBridge.oidcToken;
export const oidcUserInfo = OidcBridge.oidcUserInfo;

// calendar
export const generateCalendarICS = Calendar.generateCalendarICS;

// email webhooks
export const mailtrapWebhook = Email.mailtrapWebhook;

// zefix registry lookup
export const zefixSearch = Zefix.zefixSearch;
export const zefixGetByUid = Zefix.zefixGetByUid;

// google file search rag
export const getOrCreateStore = Rag.getOrCreateStore;
export const queryRag = Rag.queryRag;
// storage triggers: auto-index/remove files at tenant/{tenantId}/rag/{fileName}
export const onRagFileCreated = Rag.onRagFileCreated;
export const onRagFileDeleted = Rag.onRagFileDeleted;

// test
export const getEcho = Test.getEcho;
export const getIpInfo = Test.getIpInfo;

