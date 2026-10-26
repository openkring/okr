import './init'; // Import the initialization logic to ensure Firebase Admin SDK is initialized
import express, { Express } from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions'; // needed for logger

import * as Test from './test';
import * as Address from './address';
import * as FinanceDocument from './finance-document';
import * as FinanceCreated from './finance-created';
import * as Calendar from './calendar';
import * as Replication from './replication';
import * as Auth from './auth';
import * as AccountSync from './auth/account-sync';
import * as AuthAdmin from './auth/auth-admin';
import * as LoginId from './auth/login-id';
import * as LoginWithLoginId from './auth/login-with-login-id';
import * as Passkey from './auth/passkey';
import * as LoginIdAdmin from './auth/login-id-admin';
import * as MatrixSimple from './matrix-simple';
import * as MatrixMembershipSync from './matrix-simple/membership-sync';
import * as MatrixPostPolicy from './matrix-simple/post-policy-sync';
import * as MatrixAdmin from './matrix-simple/matrix-admin';
import * as MatrixUser from './matrix-simple/matrix-user';
import * as Rag from './rag';
import * as Ocr from './ocr';
import * as Vectorize from './vectorize';
import * as Video from './video';
import * as FileTransfer from './file-transfer';
import * as Learning from './learning';
import * as Group from './group';
import * as Storage from './storage';
import * as Membership from './membership';
import * as Expense from './expense';
import * as Booking from './booking';
import * as Invoice from './invoice';
import * as Bill from './bill';
import * as BankImport from './bank-import';
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
import * as WorkflowUiEvent from './workflow/ui-event';
import * as WorkflowOutbox from './workflow/outbox';
import * as Approval from './approval';
import * as Content from './content';
import * as Contract from './contract';
import * as Journal from './journal';

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
export const listMyLoginTenants = Auth.listMyLoginTenants;
export const deleteFirebaseAuthUser = Auth.deleteFirebaseAuthUser;
export const sendEmail = Auth.sendEmail;

// replication
export const onAddressChange = Replication.onAddressChange;
export const onResourceChange = Replication.onResourceChange;
export const onPersonChange = Replication.onPersonChange;
export const onOrgChange = Replication.onOrgChange;
export const onAppConfigChange = Replication.onAppConfigChange;

// matrix-simple (Simpler Firebase → Matrix token exchange)
export const getMatrixCredentials = MatrixSimple.getMatrixCredentials;
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
export const getRoomMessages = MatrixSimple.getRoomMessages;
export const getMemberDetails = MatrixSimple.getMemberDetails;
export const addMatrixRoomAlias = MatrixSimple.addMatrixRoomAlias;
export const sendCallNotification = MatrixSimple.sendCallNotification;
export const registerMatrixPusher = MatrixSimple.registerMatrixPusher;
export const matrixPushGateway = MatrixSimple.matrixPushGateway;
export const backfillMatrixRoomTenants = MatrixSimple.backfillMatrixRoomTenants;
// Mandantenzuordnung von Hand, fuer Raeume die der Backfill nicht ableiten kann (Bruecken-Raeume)
export const listUnassignedMatrixRooms = MatrixSimple.listUnassignedMatrixRooms;
export const assignMatrixRoomTenants = MatrixSimple.assignMatrixRoomTenants;
// Ad-hoc-Chats: ein Chat mit mehreren Personen ohne eigene Gruppe (spec 2026-09-01)
export const createAdhocChat = MatrixSimple.createAdhocChat;
export const leaveAdhocChat = MatrixSimple.leaveAdhocChat;
export const addAdhocChatMembers = MatrixSimple.addAdhocChatMembers;
// Chat-Aktionen (TOC 1.109): Mitglied aus Ad-hoc-Chat entfernen, «Für alle» anheften
export const removeAdhocChatMember = MatrixSimple.removeAdhocChatMember;
export const setChatPins = MatrixSimple.setChatPins;
// onGroupDocWritten: groups/{groupId}, one trigger fanning out to the seven former group triggers (replication, adminKeys, name, postPolicy, chatMode, chatCleanup, pinboard; 1.118 A3)
export const onGroupDocWritten = Group.onGroupDocWritten;
// onMembershipDocWritten: memberships/{membershipId}, one trigger fanning out to the four former membership triggers (matrixSync, pinboardSource, accountSync, exitSettlement; 1.118 A4)
export const onMembershipDocWritten = Membership.onMembershipDocWritten;
export const resolveNotesRoom = MatrixSimple.resolveNotesRoom;

// Pinnwand: alle schreiben an alle, Antworten privat (spec 2026-10-11, TOC 1.95)
export const sendChatReminders = MatrixSimple.sendChatReminders;
export const createPinboard = MatrixSimple.createPinboard;
export const updatePinboard = MatrixSimple.updatePinboard;
export const archivePinboard = MatrixSimple.archivePinboard;
export const leavePinboard = MatrixSimple.leavePinboard;
export const joinPinboard = MatrixSimple.joinPinboard;
export const listAvailablePinboards = MatrixSimple.listAvailablePinboards;
// membership → Matrix-room sync (server-side backstop; chat design review #3)
export const reconcileGroupRoomMembers = MatrixMembershipSync.reconcileGroupRoomMembers;
export const syncRoomPostPolicy = MatrixPostPolicy.syncRoomPostPolicy;
// matrixAdmin: one router callable for the 19 Matrix admin callables above, which stay as aliases (TOC 3.41 A1)
export const matrixAdmin = MatrixAdmin.matrixAdmin;
// matrixUser: one router callable for 16 user-facing chat callables above (aliases) plus syncFirebaseProfileToMatrix (op only, no export) (TOC 3.41 A2)
export const matrixUser = MatrixUser.matrixUser;
// group-room drift: report room members without a membership, and prune them on demand
export const auditGroupRoomMembers = MatrixMembershipSync.auditGroupRoomMembers;
export const pruneGroupRoomExtras = MatrixMembershipSync.pruneGroupRoomExtras;

// membership → user-account sync (spec 2026-08-12-membership-account-sync-design.md)
export const syncPersonAccount = AccountSync.syncPersonAccount;

// Benutzername (spec 2026-09-30-login-id-spec.md): daily backfill sweep — assigns a loginId
// to every user who does not yet have one
export const assignMissingLoginIds = LoginId.assignMissingLoginIds;
// Login by Benutzername (spec 2026-09-30-login-id-spec.md §5.1): verifies the password server-side
// and hands back a custom token so the client never learns the account's email.
export const loginWithLoginId = LoginWithLoginId.loginWithLoginId;
export const passkey = Passkey.passkey;
// Admin changes to the login identity (spec 2026-09-30-login-id-spec.md §3, §6b): hand the real
// email from one account to another (the swap), and change a Benutzername on purpose.
export const swapLoginEmail = LoginIdAdmin.swapLoginEmail;
export const setLoginId = LoginIdAdmin.setLoginId;
// authAdmin: one router callable for the 12 auth admin callables above (createCustomToken … deleteFirebaseAuthUser,
// syncPersonAccount, swapLoginEmail, setLoginId), which stay as aliases (TOC 3.41 A5)
export const authAdmin = AuthAdmin.authAdmin;

// workflow trigger rules — event producers, the side-effect outbox and the approval step
// (specs 2026-08-12-workflow-trigger-rules-design.md, 2026-08-15-approval-workflow-spec.md)
export const onReservationCreated = WorkflowEmit.onReservationCreated;
export { onApplicationDocWritten } from './workflow/on-application-doc-written';
// UI-originated triggers: a CMS button press / a menu selection with no document behind it
export const emitUiEvent = WorkflowUiEvent.emitUiEvent;
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
export const onCalEventCommentCreated = Calendar.onCalEventCommentCreated;
export const onCalEventDocumentCreated = Calendar.onCalEventDocumentCreated;
export const onInvitationCreated = Calendar.onInvitationCreated;
export const invitationAnswer = Calendar.invitationAnswer;

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
export const getSrvMemberDetail = Srv.getSrvMemberDetail;
export const createSrvContact = Srv.createSrvContact;
export const updateSrvContact = Srv.updateSrvContact;

// zefix registry lookup
// external-data-gateway: zefix retrofitted onto the gateway (cache + quota + attribution)
export const zefixSearch = Gateway.zefixSearch;
export const zefixGetByUid = Gateway.zefixGetByUid;

// search.ch person-address lookup
// external-data-gateway: retrofitted onto the gateway (tenant-scoped cache + quota + attribution)
export const searchChSearchPerson = Gateway.searchChSearchPerson;

// google file search rag
export const getOrCreateStore = Rag.getOrCreateStore;
export const queryRag = Rag.queryRag;
// OCR result trigger (the OCR/RAG storage handlers run inside onStorageFinalized / onStorageDeleted below)
export const onOcrResultWritten = Ocr.onOcrResultWritten;
export const redoExpenseOcr = Ocr.redoExpenseOcr;
// document renderings: raster → SVG (vtracer)
export const vectorizeDocument = Vectorize.vectorizeDocument;
// storage trigger: album videos → playable mp4 + poster frame (ffmpeg renderings)
export const onAlbumVideoFinalized = Video.onAlbumVideoFinalized;
// storage triggers (default bucket): finalize = OCR + RAG index; delete = RAG remove + album renderings reap.
// Delete only covers real Storage deletions; the UI's delete ARCHIVES and leaves the object in place.
export const onStorageFinalized = Storage.onStorageFinalized;
export const onStorageDeleted = Storage.onStorageDeleted;
// expense creation (CF-only writes to the `expenses` collection)
export const createExpense = Expense.createExpense;
export const deleteExpense = Expense.deleteExpense;
export const updateExpense = Expense.updateExpense;
export const onExpenseDone = Expense.onExpenseDone;
// treasurer approve/reject on forReview bookings (bookings/booking-lines are CF-write-only)
export const reviewBooking = Booking.reviewBooking;
// manual journal entries (create/update/delete) — same reason: bookings are CF-write-only
export const writeBooking = Booking.writeBooking;
// yearly depreciation run: one booking per books and fiscal year + one asset movement per asset (spec 1.103)
export { postDepreciation } from './asset/post-depreciation';
// add a Beleg to a booking: signed upload into the private bucket, then the finance-document + documentKeys
export const prepareBookingVoucherUpload = Booking.prepareBookingVoucherUpload;
export const attachBookingVoucher = Booking.attachBookingVoucher;
export const writeInvoice = Invoice.writeInvoice;
export const issueInvoice = Invoice.issueInvoice;
export const recordInvoicePayment = Invoice.recordInvoicePayment;
export const cancelInvoice = Invoice.cancelInvoice;
export const createPaymentConfirmation = Invoice.createPaymentConfirmation;
export const createInvoiceReminder = Invoice.createInvoiceReminder;
export const sendInvoiceEmail = Invoice.sendInvoiceEmail;
export const getInvoiceEmailDraft = Invoice.getInvoiceEmailDraft;
export const previewInvoicePdf = Invoice.previewInvoicePdf;
export const markInvoiceSent = Invoice.markInvoiceSent;
export const getReminderPrintPdf = Invoice.getReminderPrintPdf;
export const waiveReminderFee = Invoice.waiveReminderFee;
export const recordBillPayment = Bill.recordBillPayment;
export const unlinkBillPayment = Bill.unlinkBillPayment;
export const writeBill = Bill.writeBill;
export const bookBill = Bill.bookBill;
export const updateBillDetails = Bill.updateBillDetails;
export const getBillsForApproval = Bill.getBillsForApproval;
// createdAt on new bookings, bills and invoices: the accounting overview's «Seit deinem letzten Besuch»
export const onBookingCreated = FinanceCreated.onBookingCreated;
export const onBillCreated = FinanceCreated.onBillCreated;
export const onInvoiceCreated = FinanceCreated.onInvoiceCreated;
// bank import: the only write path from bank-import-rows into the ledger (spec 1.60 §7)
export const postBankImport = BankImport.postBankImport;
// bexio journal import: mapped entries posted directly as bookings (spec 1.60 §12)
export const postJournalImport = BankImport.postJournalImport;

// address
export const generateQrBill = Address.generateQrBill;

// location conversion (address ↔ coords ↔ what3words)
export const convertLocation = Location.convertLocation;
// location avatar: Gemeinde coat of arms → canton/Bundesland → country flag, as shared avatars/location.<okey>
export const onLocationWritten = Location.onLocationWritten;

// flight tracker
export const getFlightInfo = Flighttracker.getFlightInfo;

// session analytics
export const endSession = Session.endSession;

// task notifications
export { onTaskDocWritten } from './task/on-task-doc-written';
// closed-group task list: membership check for chatMode 'members' groups (spec 1.75)
export const listGroupTasks = Task.listGroupTasks;

// trip statistics
export const onTripWrite             = Trip.onTripWrite;
// Logbuch damage / bug reports — emitted as workflow events, consequences configured as rules
export const reportIncident          = Trip.reportIncident;

// test
export const getEcho = Test.getEcho;

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
export const esignWorkflowEvents     = Esign.esignWorkflowEvents;

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
export { pushMetering, runCommission, submitProspect, pushMeteringToPlatform } from './business';
// C5 §5 — the partner-facing pool, and bkaiser's revocation lever
export { listProspects, claimProspect, releaseProspect, revokeProspect } from './business';
// C5 §5 — the same pool as the PARTNER's installation reaches it: an in-product proxy over the
// four above, so no partner hand-rolls a client (the C3 `pushMeteringToPlatform` argument).
export { listPoolProspects, claimPoolProspect, releasePoolProspect } from './business';

// C4 §3/§4 — the 3LS escalation queue. bkaiser-side (partner-authenticated submit/list/comment plus
// the admin-only classify/triage), and the partner-side proxy every installation ships.
export { submitTicket, listTickets, commentTicket, classifyTicket, triageTicket } from './business';
export { submitSupportTicket, listSupportTickets, commentSupportTicket } from './business';

// diary UI (Teilprojekt 3): weather for an entry written in the app
export { fetchDiaryWeather } from './diary/fetch-diary-weather';
// spec 1.106: the photos and documents of one diary day, read live from its Drive folder
export { getDiaryMediaImage, listDiaryMedia } from './diary/list-diary-media';
// Jasstafel (spec 1.67): a finished game's result into the caller's diary in every tenant of their `diaryTargets`
export { recordDiaryLine } from './diary/record-diary-line';
export { listMyDiaryTenants } from './diary/list-my-diary-tenants';

// re-derive the dob/dod replicas from the live vault (the dateOfDeath migration ran and was retired 2026-10-24, spec 1.118 D3)
export { resyncVaultReplicas } from './person/resync-vault-replicas';

// mirror the tenants a person holds an account in (spec 2026-09-06 open events, decision 9)
export { onUserWritten, backfillAccountTenants } from './person/account-mirror';

// exit fee settlement (spec 1.105): the exitSettlement handler of onMembershipDocWritten opens,
// updates, closes or reopens the treasurer's pro-rata settlement task on a changed exit; a
// not-yet-invoiced fee row is rebuilt pro rata instead.
// the treasurer's decision on that task: refund, adjust the invoice or exit on 31.12.
export { settleMembershipExit } from './member-fee/settle-membership-exit';

// member-fees generic positions (2026-09-17): 'native' accountingBackend counterpart to
// uploadToBexio/createBexioInvoice — posts 'ready' member-fees as real InvoiceModel +
// InvoicePositionModel documents
export { postMemberFees } from './member-fee/post-member-fees';

// Kostenrechnung 1.65 §6.4: free-text → cost-centre key and current-year backfill (treasurer)
export { migrateCostCenters } from './cost-center/migrate-cost-centers';
export { getMyCostCenterReport } from './cost-center/get-my-cost-center-report';

// address-directory projection rebuild/backfill (privacy 1.19 Phase 4)
export { rebuildAddressDirectory } from './address/rebuild-address-directory';

// tiered on-demand vault read (privacy 1.19 Phase 4, D9/D-P4-1)
export { getAddressView } from './address/get-address-view';

// tenant allocation (spec 1.47): move a person between tenants, with an audit entry
export { allocateTenant, getAllocationEmails } from './tenant-allocation';

// exchange rates
export { fetchMeteoSwissRadar } from './weather/fetch-meteoswiss-radar';

// payment
export { generatePain001 } from './payment/generate-pain001';
export { approvePaymentOrder } from './payment/approve-payment-order';
export { parseQrInvoice } from './payment/parse-qr-invoice';

// privacy 1.19 Phase 5B: GDPR/revDSG subject-access export delivery (D-P5-1) —
// exportMyData zips + signs the caller's own export (stale artifacts are reaped by nightlyMaintenance)
// signFinanceDocuments: short-lived links to vouchers in the private bucket (spec 1.74)
export const signFinanceDocuments = FinanceDocument.signFinanceDocuments;
// signVideoUrls: signed imgix poster/mp4 URLs for album videos in the private bucket (spec 1.82)
export const signVideoUrls = Video.signVideoUrls;
// prepareChatVideoUpload: chat video → room album in the private bucket, signed upload URL (spec 1.82 §8)
export const prepareChatVideoUpload = Video.prepareChatVideoUpload;
export const exportMyData = Privacy.exportMyData;

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

// contracts (spec 1.5 §6.2; the daily deadline scan is the contractDeadlineScan job of morningJobs)
export const onContractWritten = Contract.onContractWritten;
// contract dossier files: signed upload, register (SHA-256) and signed view links (spec 1.5 §7)
export const requestContractUpload = Contract.requestContractUpload;
export const registerContractDocument = Contract.registerContractDocument;
export const signContractDocuments = Contract.signContractDocuments;
// member-shared dossier files behind a ContractDocument button (spec 1.97 §5)
export const setContractDocumentShared = Contract.setContractDocumentShared;
export const openSharedContractDocument = Contract.openSharedContractDocument;
export const requestContract = Contract.requestContract;
// request status under a contract button (spec 1.88 §5.3)
export const getContractRequestStatus = Contract.getContractRequestStatus;
// on-demand Gemini abstract of a contract file (spec 1.5 §7.3)
export { summarizeContract } from './contract/summarize';

// prepareFileTransferUpload: quick file transfer, resumable upload sessions in the private bucket (spec 1.115)
export const prepareFileTransferUpload = FileTransfer.prepareFileTransferUpload;
// sendFileTransfer: quick file transfer, personal links, notifications and chat card (spec 1.115)
export const sendFileTransfer = FileTransfer.sendFileTransfer;
// getFileTransfer: quick file transfer, the view for a logged-in member (sender, admin, person recipient) (spec 1.115)
export const getFileTransfer = FileTransfer.getFileTransfer;
// openFileTransferFile: quick file transfer, signed play/download url for a member, logs opened/downloaded (spec 1.115)
export const openFileTransferFile = FileTransfer.openFileTransferFile;
// endFileTransfer: quick file transfer, sender or admin ends an open transfer early, deletes the files (spec 1.115)
export const endFileTransfer = FileTransfer.endFileTransfer;
// requestFileTransferLimit: quick file transfer, member asks for higher limits via the tenant support room (spec 1.115)
export const requestFileTransferLimit = FileTransfer.requestFileTransferLimit;

// saveLearningItem: learning rooms, a curator edits title, topics, notes, links and attachments of an item (spec 1.115)
export const saveLearningItem = Learning.saveLearningItem;
// prepareLearningUpload: learning rooms, a curator uploads into a topic — document + signed upload URL (spec 1.115)
export const prepareLearningUpload = Learning.prepareLearningUpload;
// completeLearningUpload: learning rooms, verifies a finished upload, sets the download token and doc.url (spec 1.115)
export const completeLearningUpload = Learning.completeLearningUpload;
// travel journal (spec 1.113 plan 4)
export const applyJournalChange = Journal.applyJournalChange;
export const prepareJournalPhotoUploads = Journal.prepareJournalPhotoUploads;
export const signJournalPhotos = Journal.signJournalPhotos;
export const ensureJournalPeerSecret = Journal.ensureJournalPeerSecret;
export const journalGuest = Journal.journalGuest;
export const manageJournalGuest = Journal.manageJournalGuest;
export const notifyJournalGuests = Journal.notifyJournalGuests;
// exportJournalBook: the travel book as print PDF/X-4 or screen PDF, streamed into the private bucket (spec 1.113 phase 2)
export const exportJournalBook = Journal.exportJournalBook;
// deleteLearningItem: learning rooms, a curator removes an item — detach from the room folder or archive (spec 1.115)
export const deleteLearningItem = Learning.deleteLearningItem;
// onRatingWritten: learning rooms, a rating write refreshes docs/{docKey}.ratingCount/ratingSum (spec 1.115)
export const onRatingWritten = Learning.onRatingWritten;

// time-slot schedulers (spec 1.118 A9): replace fifteen separate onSchedule functions
export { nightlyMaintenance, morningJobs, eveningJobs, halfHourlyJobs } from './_schedules';
