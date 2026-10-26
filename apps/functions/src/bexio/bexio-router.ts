/**
 * bexio — one router callable beside the bexio callables (TOC 3.41, A6).
 *
 * Each op runs the same handler as its stand-alone callable, which keeps its own guards and tenant
 * handling inside the body; the router checks nothing per op and reads no tenant from the request.
 * The six former client-facing names stay as aliases with their own old options; the four sync
 * callables (syncBexioInvoices/Bills/Journal/Accounts) are op-only.
 */
import { makeOpRouter, type OpHandler } from '../_router';
import { bexioApiKey, bexioDefaultTaxId, bexioTenantId, bexioUserId } from './shared';
import { handleCreateBexioContact, handleGetBexioContacts, handleUpdateBexioContact } from './contact';
import { handleCreateBexioInvoice, handleShowInvoicePdf, handleSyncBexioInvoices } from './invoice';
import { handleShowBillPdf, handleSyncBexioBills } from './bill';
import { handleSyncBexioJournal } from './journal';
import { handleSyncBexioAccounts } from './account';

export const BEXIO_OPS: Record<string, OpHandler> = {
  getBexioContacts: handleGetBexioContacts,
  createBexioContact: handleCreateBexioContact,
  updateBexioContact: handleUpdateBexioContact,
  createBexioInvoice: handleCreateBexioInvoice,
  showInvoicePdf: handleShowInvoicePdf,
  showBillPdf: handleShowBillPdf,
  syncBexioInvoices: handleSyncBexioInvoices,
  syncBexioBills: handleSyncBexioBills,
  syncBexioJournal: handleSyncBexioJournal,
  syncBexioAccounts: handleSyncBexioAccounts,
};

export const BEXIO_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  memory: '1GiB' as const,
  timeoutSeconds: 540,
  secrets: [bexioApiKey, bexioUserId, bexioTenantId, bexioDefaultTaxId],
};

export const bexio = makeOpRouter('bexio', BEXIO_OPTIONS, BEXIO_OPS);
