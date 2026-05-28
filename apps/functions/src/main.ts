import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express, { Express } from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Address from './address';
import * as Calendar from './calendar';
import * as Replication from './replication';
import * as Auth from './auth';
import * as Matrix from './matrix';
import * as OidcBridge from './oidc-bridge';
import * as MatrixSimple from './matrix-simple';
import * as Rag from './rag';
import * as Email from './email';
import * as Bexio from './bexio';
import * as Zefix from './zefix';
import * as Location from './location';
import * as Srv from './srv';
import * as Flighttracker from './flighttracker';
import * as Session from './session';
import * as Task from './task';
import * as Trip from './trip';
import * as Pdf from './pdf';
import * as Esign from './esign';
import * as Forms from './forms';

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
export const matrixPushGateway = MatrixSimple.matrixPushGateway;

// oidc-bridge (Full OIDC Identity Provider for Matrix - Complex but native Matrix SSO)
export const oidcDiscovery = OidcBridge.oidcDiscovery;
export const oidcAuthorize = OidcBridge.oidcAuthorize;
export const oidcCallback = OidcBridge.oidcCallback;
export const oidcExchange = OidcBridge.oidcExchange;
export const oidcToken = OidcBridge.oidcToken;
export const oidcUserInfo = OidcBridge.oidcUserInfo;

// calendar
export const generateCalendarICS = Calendar.generateCalendarICS;
export const getPublicCalEvents = Calendar.getPublicCalEvents;

// email webhooks
export const mailtrapWebhook = Email.mailtrapWebhook;

// bexio contact sync
export const getBexioContacts = Bexio.getBexioContacts;
export const createBexioContact = Bexio.createBexioContact;
export const updateBexioContact = Bexio.updateBexioContact;

// bexio invoice create
export const createBexioInvoice = Bexio.createBexioInvoice;

// bexio invoice sync
export const syncBexioInvoices = Bexio.syncBexioInvoices;
export const scheduledBexioInvoiceSync = Bexio.scheduledBexioInvoiceSync;
export const showInvoicePdf = Bexio.showInvoicePdf;

// bexio bill sync
export const syncBexioBills = Bexio.syncBexioBills;
export const scheduleBexioBillSync = Bexio.scheduleBexioBillSync;
export const showBillPdf = Bexio.showBillPdf;

// bexio journal sync
export const syncBexioJournal = Bexio.syncBexioJournal;
export const scheduleBexioJournalSync = Bexio.scheduleBexioJournalSync;

// bexio account sync
export const syncBexioAccounts = Bexio.syncBexioAccounts;

// srv (Regasoft SRV) contact sync
export const getSrvContacts = Srv.getSrvContacts;
export const getSrvLicensedMembers = Srv.getSrvLicensedMembers;
export const getSrvMemberDetail = Srv.getSrvMemberDetail;
export const createSrvContact = Srv.createSrvContact;
export const updateSrvContact = Srv.updateSrvContact;

// zefix registry lookup
export const zefixSearch = Zefix.zefixSearch;
export const zefixGetByUid = Zefix.zefixGetByUid;

// google file search rag
export const getOrCreateStore = Rag.getOrCreateStore;
export const queryRag = Rag.queryRag;
// storage triggers: auto-index/remove files at tenant/{tenantId}/rag/{fileName}
export const onRagFileCreated = Rag.onRagFileCreated;
export const onRagFileDeleted = Rag.onRagFileDeleted;

// address
export const generateQrBill = Address.generateQrBill;

// location conversion (address ↔ coords ↔ what3words)
export const convertLocation = Location.convertLocation;

// flight tracker
export const getFlightInfo = Flighttracker.getFlightInfo;

// session analytics
export const endSession = Session.endSession;
export const cleanupOrphanSessions = Session.cleanupOrphanSessions;

// task notifications
export const onTaskWritten = Task.onTaskWritten;

// trip statistics
export const onTripWrite             = Trip.onTripWrite;
export const onTripStatsReconcile    = Trip.onTripStatsReconcile;

// test
export const getEcho = Test.getEcho;
export const getIpInfo = Test.getIpInfo;

// public api (SCS website)
import * as PublicApi from './publicApi';
export const publicApi = PublicApi.publicApi;

// pdf document generation
export const generateDocument = Pdf.generateDocument;

// e-signature (DeepSign)
export const esignScanPredefined     = Esign.esignScanPredefined;
export const esignSendDocument       = Esign.esignSendDocument;
export const esignGetDocumentDetails = Esign.esignGetDocumentDetails;
export const esignResendInvitation   = Esign.esignResendInvitation;
export const esignDelete             = Esign.esignDelete;
export const esignSendByEmail        = Esign.esignSendByEmail;
export const esignWebhook            = Esign.esignWebhook;
export const esignArchiveSigned      = Esign.esignArchiveSigned;

// form submission
export const submitForm = Forms.submitForm;

// exchange rates
export { fetchSnbRatesScheduled } from './exchange-rate/fetch-snb-rates';
export { setManualRate } from './exchange-rate/set-manual-rate';

// payment
export { generatePain001 } from './payment/generate-pain001';
export { generateInvoicePdf } from './payment/generate-invoice-pdf';
export { parseQrInvoice } from './payment/parse-qr-invoice';
export { generateDunningPdf } from './payment/generate-dunning-pdf';
