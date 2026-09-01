import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express, { Express } from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Address from './address';
import * as Calendar from './calendar';
import * as Replication from './replication';
import * as Auth from './auth';
import * as AccountSync from './auth/account-sync';
import * as MatrixSimple from './matrix-simple';
import * as MatrixMembershipSync from './matrix-simple/membership-sync';
import * as MatrixPostPolicy from './matrix-simple/post-policy-sync';
import * as Rag from './rag';
import * as Ocr from './ocr';
import * as Vectorize from './vectorize';
import * as Expense from './expense';
import * as Booking from './booking';
import * as Email from './email';
import * as Bexio from './bexio';
import * as Gateway from './_gateway';
import * as Location from './location';
import * as Srv from './srv';
import * as Flighttracker from './flighttracker';
import * as Session from './session';
import * as Task from './task';
import * as Trip from './trip';
import * as Pdf from './pdf';
import * as Esign from './esign';
import * as Alias from './alias';
import * as Forms from './forms';
import * as Vcard from './vcard';
import * as Person from './person';
import * as Privacy from './privacy';
import * as Tenant from './tenant';
import * as WorkflowEmit from './workflow/emit';
import * as WorkflowOutbox from './workflow/outbox';
import * as Approval from './approval';
import * as Content from './content';

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
export const listBkUsers = Auth.listBkUsers;
export const deleteFirebaseAuthUser = Auth.deleteFirebaseAuthUser;
export const sendEmail = Auth.sendEmail;

// replication
export const onAddressChange = Replication.onAddressChange;
export const onResourceChange = Replication.onResourceChange;
export const onPersonChange = Replication.onPersonChange;
export const onOrgChange = Replication.onOrgChange;
export const onGroupChange = Replication.onGroupChange;
export const onAppConfigChange = Replication.onAppConfigChange;

// matrix-simple (Simpler Firebase → Matrix token exchange)
export const getMatrixCredentials = MatrixSimple.getMatrixCredentials;
export const syncFirebaseProfileToMatrix = MatrixSimple.syncFirebaseProfileToMatrix;
export const requestGroupRoomAccess = MatrixSimple.requestGroupRoomAccess;
export const provisionMatrixUser = MatrixSimple.provisionMatrixUser;
export const renameMatrixRoom = MatrixSimple.renameMatrixRoom;
export const invitePersonToGroupRoom = MatrixSimple.invitePersonToGroupRoom;
export const kickPersonFromGroupRoom = MatrixSimple.kickPersonFromGroupRoom;
export const deleteMatrixRoom = MatrixSimple.deleteMatrixRoom;
export const setKioskCallRoomPolicy = MatrixSimple.setKioskCallRoomPolicy;
export const deactivateMatrixUser = MatrixSimple.deactivateMatrixUser;
export const repairMatrixDisplayNames = MatrixSimple.repairMatrixDisplayNames;
export const repairMatrixAvatars = MatrixSimple.repairMatrixAvatars;
export const listMatrixRooms = MatrixSimple.listMatrixRooms;
export const getRoomDetails = MatrixSimple.getRoomDetails;
export const getAllMembersFromRoom = MatrixSimple.getAllMembersFromRoom;
export const getMemberDetails = MatrixSimple.getMemberDetails;
export const addMatrixRoomAlias = MatrixSimple.addMatrixRoomAlias;
export const sendCallNotification = MatrixSimple.sendCallNotification;
export const registerMatrixPusher = MatrixSimple.registerMatrixPusher;
export const matrixPushGateway = MatrixSimple.matrixPushGateway;
export const backfillMatrixRoomTenants = MatrixSimple.backfillMatrixRoomTenants;
// Ad-hoc-Chats: ein Chat mit mehreren Personen ohne eigene Gruppe (spec 2026-09-01)
export const createAdhocChat = MatrixSimple.createAdhocChat;
export const leaveAdhocChat = MatrixSimple.leaveAdhocChat;
export const addAdhocChatMembers = MatrixSimple.addAdhocChatMembers;
// membership → Matrix-room sync (server-side backstop; chat design review #3)
export const onMembershipWritten = MatrixMembershipSync.onMembershipWritten;
export const reconcileGroupRoomMembers = MatrixMembershipSync.reconcileGroupRoomMembers;
export const onGroupPostPolicyWritten = MatrixPostPolicy.onGroupPostPolicyWritten;
export const sweepRoomPostPolicies = MatrixPostPolicy.sweepRoomPostPolicies;
export const syncRoomPostPolicy = MatrixPostPolicy.syncRoomPostPolicy;
// group-room drift: report room members without a membership, and prune them on demand
export const auditGroupRoomMembers = MatrixMembershipSync.auditGroupRoomMembers;
export const pruneGroupRoomExtras = MatrixMembershipSync.pruneGroupRoomExtras;

// membership → user-account sync (spec 2026-08-12-membership-account-sync-design.md)
export const onMembershipAccountSync = AccountSync.onMembershipAccountSync;
export const sweepExpiredMemberships = AccountSync.sweepExpiredMemberships;
export const syncPersonAccount = AccountSync.syncPersonAccount;

// workflow trigger rules — event producers, the side-effect outbox and the approval step
// (specs 2026-08-12-workflow-trigger-rules-design.md, 2026-08-15-approval-workflow-spec.md)
export const onReservationCreated = WorkflowEmit.onReservationCreated;
export const onApplicationCreated = WorkflowEmit.onApplicationCreated;
export const onTaskCompleted = WorkflowEmit.onTaskCompleted;
export const onWorkflowOutbox = WorkflowOutbox.onWorkflowOutbox;
export const decideApproval = Approval.decideApproval;
export const onApprovalDecided = Approval.onApprovalDecided;

// oidc-bridge removed (C-3): unused, insecure OIDC IdP. Matrix auth uses the
// token-exchange approach (getMatrixCredentials in matrix-simple) instead.

// calendar
export const generateCalendarICS = Calendar.generateCalendarICS;
export const getPublicCalEvents = Calendar.getPublicCalEvents;
export const ensureCalendarFeedToken = Calendar.ensureCalendarFeedToken;
export const calendarFeed = Calendar.calendarFeed;
export const notifyCalEventParticipants = Calendar.notifyCalEventParticipants;
export const onCalEventCommentCreated = Calendar.onCalEventCommentCreated;
export const onCalEventDocumentCreated = Calendar.onCalEventDocumentCreated;

// email webhooks
export const mailtrapWebhook = Email.mailtrapWebhook;
export const onMailJob = Email.onMailJob;

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
// external-data-gateway: zefix retrofitted onto the gateway (cache + quota + attribution)
export const zefixSearch = Gateway.zefixSearch;
export const zefixGetByUid = Gateway.zefixGetByUid;

// external-data-gateway: OECD statistics (2.59) — first new consumer
export const oecdQuery = Gateway.oecdQuery;

// search.ch person-address lookup
// external-data-gateway: retrofitted onto the gateway (tenant-scoped cache + quota + attribution)
export const searchChSearchPerson = Gateway.searchChSearchPerson;

// google file search rag
export const getOrCreateStore = Rag.getOrCreateStore;
export const queryRag = Rag.queryRag;
// storage triggers: auto-index/remove files at tenant/{tenantId}/rag/{fileName}
export const onRagFileCreated = Rag.onRagFileCreated;
export const onRagFileDeleted = Rag.onRagFileDeleted;
// storage + firestore triggers: OCR pipeline at tenant/{tenantId}/ocr/{ocrUsage}/...
export const onOcrFileFinalized = Ocr.onOcrFileFinalized;
export const onOcrResultWritten = Ocr.onOcrResultWritten;
export const redoExpenseOcr = Ocr.redoExpenseOcr;
// document renderings: raster → SVG (vtracer)
export const vectorizeDocument = Vectorize.vectorizeDocument;
// expense creation (CF-only writes to the `expenses` collection)
export const createExpense = Expense.createExpense;
export const deleteExpense = Expense.deleteExpense;
// treasurer approve/reject on forReview bookings (bookings/booking-lines are CF-write-only)
export const reviewBooking = Booking.reviewBooking;
// manual journal entries (create/update/delete) — same reason: bookings are CF-write-only
export const writeBooking = Booking.writeBooking;

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
export const onOpenTripCheck         = Trip.onOpenTripCheck;
// Logbuch damage / bug reports — emitted as workflow events, consequences configured as rules
export const reportIncident          = Trip.reportIncident;

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

// form submission + JS token endpoint
export const getFormToken = Forms.getFormToken;
export const submitForm = Forms.submitForm;
export const getFormDefinition = Forms.getFormDefinition;

// vCard export (spec 17)
export const vcardExport = Vcard.vcardExport;

// person duplicate detection + cross-tenant merge
export const findPersonDuplicates = Person.findPersonDuplicates;
export const mergePersonIntoTenant = Person.mergePersonIntoTenant;

// org cross-tenant share — dual-tenant orgs for the partner channel (spec 1.26 C1 §6)
export { mergeOrgIntoTenant } from './org';

// partner channel — C3 metering ingest + commission run, C5 prospect signup
export { pushMetering, runCommission, checkPartnerHeartbeats, submitProspect, pushMeteringToPlatform } from './business';
// C5 §5 — the partner-facing pool, and bkaiser's revocation lever
export { listProspects, claimProspect, releaseProspect, revokeProspect } from './business';
// C5 §5 — the same pool as the PARTNER's installation reaches it: an in-product proxy over the
// four above, so no partner hand-rolls a client (the C3 `pushMeteringToPlatform` argument).
export { listPoolProspects, claimPoolProspect, releasePoolProspect } from './business';

// C4 §3/§4 — the 3LS escalation queue. bkaiser-side (partner-authenticated submit/list/comment plus
// the admin-only classify/triage), and the partner-side proxy every installation ships.
export { submitTicket, listTickets, commentTicket, classifyTicket, triageTicket } from './business';
export { submitSupportTicket, listSupportTickets, commentSupportTicket } from './business';

// diary import (design 2026-08-22): proves Drive access before the import is built
export { checkDriveAccess } from './diary/check-drive-access';
// diary import (design 2026-08-22): the dry-run report and the windowed, cursor-driven commit
export { dryRunDiaryImport, commitDiaryImport } from './diary/import-diary';

// privacy 1.19 Phase 3: one-time backfill of the ssn/dob vault + memberBirthYear
export { migrateSensitiveData } from './person/migrate-sensitive-data';

// privacy 1.19: one-time migration of dateOfDeath into the 'dod' vault channel
export { migrateDateOfDeath } from './person/migrate-sensitive-data';

// re-derive the dob/dod replicas from the live vault (run AFTER migrateDateOfDeath)
export { resyncVaultReplicas } from './person/resync-vault-replicas';

// address-directory projection rebuild/backfill (privacy 1.19 Phase 4)
export { rebuildAddressDirectory } from './address/rebuild-address-directory';

// tiered on-demand vault read (privacy 1.19 Phase 4, D9/D-P4-1)
export { getAddressView } from './address/get-address-view';

// exchange rates
export { fetchSnbRatesScheduled } from './exchange-rate/fetch-snb-rates';
export { scheduledWeatherFetch } from './weather/fetch-weather';
export { setManualRate } from './exchange-rate/set-manual-rate';

// payment
export { generatePain001 } from './payment/generate-pain001';
export { generateInvoicePdf } from './payment/generate-invoice-pdf';
export { parseQrInvoice } from './payment/parse-qr-invoice';
export { generateDunningPdf } from './payment/generate-dunning-pdf';

// privacy 1.19 Phase 5B: GDPR/revDSG subject-access export delivery (D-P5-1) —
// exportMyData zips + signs the caller's own export, reapPrivacyExports reaps stale artifacts
export const exportMyData = Privacy.exportMyData;
export const reapPrivacyExports = Privacy.reapPrivacyExports;

// privacy 1.19 Phase 5B: tenant-scoped right to erasure (D-P5-2/D-P5-6, D-L2) —
// previewMyErasure builds the honest preflight report, eraseMyData executes the erasure
// the member confirmed (token-checked against a freshly rebuilt preview)
export const previewMyErasure = Privacy.previewMyErasure;
export const eraseMyData = Privacy.eraseMyData;

// privacy 1.19 Phase 5D: admin-only conformance audit — eleven checks over the tenant's
// Firestore data, its Bearbeitungsverzeichnis and its policy state. Reads only; every
// finding links to the screen where a human fixes it.
export const runPrivacyAudit = Privacy.runPrivacyAudit;

// alias (spec 2026-08-22): der EINZIGE Schreibpfad auf `aliases`. Die Collection ist
// `allow write: if false`, weil die Document-ID deterministisch ist und ein Client-setDoc
// einen bereits gedruckten Alias still ueberschreiben wuerde; nur `.create()` des Admin SDK
// wirft bei Kollision. createAlias praegt IMMER neu (Messpunkt), resolveAlias ist idempotent
// (Identitaet des Ziels) — Spec, Entscheid 4.
export const createAlias = Alias.createAlias;
export const resolveAlias = Alias.resolveAlias;

// feature building blocks — admin-only, single server-side write path for a tenant's
// feature selection (D-BB-9). Wired with the Angular-free metadata half of the catalogue
// (`@okr/tenant-util`'s `FEATURE_BLOCKS`) — see `apps/functions/src/tenant/index.ts`.
export const applyFeatureSelection = Tenant.applyFeatureSelection;

// admin-only listing of a tenant's Storage objects (AOC "Dateien ohne DB-Eintrag").
// A client-side listAll() cannot work: storage.rules authorises via the cross-service
// firestore.get(), which does not resolve on a `list` request — see ./tenant/list-storage-files.ts.
export const listTenantStorageFiles = Tenant.listTenantStorageFiles;

// group-admin deletion of files/folders inside a group's files segment. firestore.rules
// cannot express "caller is an admin of this group" (GroupModel.admins is a list of maps),
// so this is the only write path a group admin who is neither content manager, folder
// owner nor document author has. See ./content/delete-group-content.ts.
export const deleteGroupContent = Content.deleteGroupContent;
export const updateGroupFolder = Content.updateGroupFolder;

// public, unauthenticated health check for external uptime monitoring (BetterStack).
// Verifies the backend is up and can reach Firestore. See ./health.
export { healthz } from './health';
