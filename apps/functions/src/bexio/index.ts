import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';

const bexioApiKey = defineSecret('BEXIO_APIKEY');
const bexioUserId = defineSecret('BEXIO_USER_ID'); // integer user ID from GET /2.0/users/me
const bexioTenantId = defineSecret('BEXIO_TENANT_ID'); // Firestore tenantId for invoice writes

const BEXIO_BASE = 'https://api.bexio.com/2.0';

export interface BexioContact {
  id: number;
  name_1: string;          // last name or company name
  name_2: string | null;   // first name (null for companies)
  street_name: string;
  house_number: string;
  postcode: string;
  city: string;
  mail: string;
  contact_type_id: number; // 1=company, 2=person
}

/**
 * Create a new contact in the Bexio API.
 * Returns the newly assigned Bexio contact ID.
 */
export const createBexioContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioUserId],
  },
  async (request: CallableRequest<{ name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number }>) => {
    const CF_NAME = 'createBexioContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id } = request.data;
    if (!name_1) {
      throw new HttpsError('invalid-argument', 'name_1 is required');
    }

    const userId = parseInt(bexioUserId.value(), 10);
    logger.info(`${CF_NAME}: creating contact "${name_1}" by bexio user ${userId}`);

    try {
      const response = await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id, user_id: userId, owner_id: userId },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: created contact with id ${response.data.id}`);
      return { id: String(response.data.id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio contact creation failed');
    }
  }
);

/**
 * Update an existing contact in the Bexio API.
 */
export const updateBexioContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioUserId],
  },
  async (request: CallableRequest<{ id: string; name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number }>) => {
    const CF_NAME = 'updateBexioContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { id, name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id } = request.data;
    if (!id || !name_1) {
      throw new HttpsError('invalid-argument', 'id and name_1 are required');
    }

    const userId = parseInt(bexioUserId.value(), 10);
    logger.info(`${CF_NAME}: updating contact ${id} "${name_1}"`);

    try {
      await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact/${id}`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id, user_id: userId, owner_id: userId },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: updated contact ${id}`);
      return { id: String(id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio contact update failed');
    }
  }
);

/**
 * Fetch all contacts from the Bexio API using pagination.
 * The API key is stored securely as a GCP secret (BEXIO_APIKEY).
 */
export const getBexioContacts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey],
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getBexioContacts';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    logger.info(`${CF_NAME}: fetching all contacts (paginated)`);

    const PAGE_SIZE = 500;
    const allContacts: BexioContact[] = [];

    try {
      let offset = 0;
      while (true) {
        const response = await axios.get<BexioContact[]>(`${BEXIO_BASE}/contact`, {
          params: { limit: PAGE_SIZE, offset },
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
          },
        });

        const page = Array.isArray(response.data) ? response.data : [];
        allContacts.push(...page);
        logger.info(`${CF_NAME}: fetched page offset=${offset}, got ${page.length} contacts`);

        if (page.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
      }

      logger.info(`${CF_NAME}: total ${allContacts.length} contacts`);

      return allContacts.map(c => ({
        id: c.id,
        name_1: c.name_1,
        name_2: c.name_2,
        street_name: c.street_name,
        house_number: c.house_number,
        postcode: c.postcode,
        city: c.city,
        mail: c.mail,
        contact_type_id: c.contact_type_id
      }));
    } catch (error: unknown) {
      logger.error(`${CF_NAME}: error`, error);
      throw new HttpsError('internal', 'Bexio API request failed');
    }
  }
);

// --------------------------------- Invoice sync ---------------------------------

interface BexioInvoice {
  id: number;
  document_nr: string;
  title: string | null;
  contact_id: number | null;
  contact_sub_id: number | null;
  user_id: number | null;
  header: string | null;
  footer: string | null;
  total_gross: string;
  total_net: string;
  total_taxes: string;
  total: string;
  mwst_type: number;
  mwst_is_net: boolean;
  is_valid_from: string | null;  // "YYYY-MM-DD"
  is_valid_to: string | null;    // "YYYY-MM-DD"
  kb_item_status_id: number;
  network_link: string | null;
  updated_at: string;            // "YYYY-MM-DD HH:mm:ss"
}

/** Convert Bexio date "YYYY-MM-DD" to StoreDate "YYYYMMDD". Returns '' for null/empty. */
function toStoreDate(bexioDate: string | null | undefined): string {
  if (!bexioDate) return '';
  return bexioDate.replace(/-/g, '');
}

/** Map kb_item_status_id to a human-readable state string. */
function mapInvoiceStatus(statusId: number): string {
  switch (statusId) {
    case 7: return 'draft';
    case 8: return 'pending';
    case 9: return 'paid';
    case 19: return 'cancelled';
    default: return String(statusId);
  }
}

function mapVatType(mwst_type: number): string {
  switch (mwst_type) {
    case 0: return 'included';
    case 1: return 'excluded';
    case 2: return 'exempt';
  }
  return '';
}

/** Fetch paginated invoices from Bexio, optionally filtered by updatedAfter ("YYYY-MM-DD HH:mm:ss"). */
async function fetchBexioInvoices(apiKey: string, updatedAfter: string): Promise<BexioInvoice[]> {
  const PAGE_SIZE = 500;
  const all: BexioInvoice[] = [];
  let offset = 0;
  while (true) {
    const response = await axios.post<BexioInvoice[]>(
      `${BEXIO_BASE}/kb_invoice/search`,
      [{ field: 'updated_at', value: updatedAfter, criteria: '>' }],
      {
        params: { limit: PAGE_SIZE, offset, order_by: 'updated_at' },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );
    const page = Array.isArray(response.data) ? response.data : [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Write invoices to Firestore and update the sync pointer. */
async function persistInvoices(invoices: BexioInvoice[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();

  for (const inv of invoices) {
    const bkey = String(inv.id);
    const totalCents = Math.round(parseFloat(inv.total) * 100);
    const doc: Record<string, unknown> = {
      tenants: [tenantId],
      isArchived: false,
      index: '',
      tags: [],
      notes: inv.contact_id + '',
      title: inv.title ?? inv.document_nr,
      invoiceId: inv.document_nr,
      invoiceDate: toStoreDate(inv.is_valid_from),
      dueDate: toStoreDate(inv.is_valid_to),
      totalAmount: { amount: totalCents, currency: 'CHF', periodicity: 'one-time' },
      taxes: parseFloat(inv.total_taxes) || 0,
      vatType: mapVatType(inv.mwst_type), 
      state: mapInvoiceStatus(inv.kb_item_status_id),
      paymentDate: ''
    };
    batch.set(db.collection('invoices').doc(bkey), doc, { merge: true });
  }

  // update sync pointer
  batch.set(db.collection('config').doc('bexioSync'), { lastSyncedAt: nowStr }, { merge: true });

  await batch.commit();
}

/** Core sync logic shared by manual and scheduled triggers. */
async function runInvoiceSync(fromDate: string, tenantId: string, label: string): Promise<{ count: number }> {
  logger.info(`${label}: fetching invoices updated after "${fromDate}"`);
  const invoices = await fetchBexioInvoices(bexioApiKey.value(), fromDate);
  logger.info(`${label}: fetched ${invoices.length} invoices`);

  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19); // "YYYY-MM-DD HH:mm:ss"
  await persistInvoices(invoices, tenantId, nowStr);
  logger.info(`${label}: persisted ${invoices.length} invoices, pointer updated to ${nowStr}`);
  return { count: invoices.length };
}

/**
 * Manual one-shot invoice sync (onCall).
 * Pass { fromDate: "YYYY-MM-DD HH:mm:ss" } to start from a specific date,
 * or omit fromDate to download the full history.
 */
export const syncBexioInvoices = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioTenantId],
  },
  async (request: CallableRequest<{ fromDate?: string }>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const fromDate = request.data?.fromDate ?? '2000-01-01 00:00:00';
    return runInvoiceSync(fromDate, bexioTenantId.value(), 'syncBexioInvoices');
  }
);

/**
 * Scheduled daily invoice sync at 06:00 Europe/Zurich.
 * Reads the last sync pointer from config/bexioSync.lastSyncedAt and fetches only new/updated invoices.
 */
export const scheduledBexioInvoiceSync = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    secrets: [bexioApiKey, bexioTenantId],
  },
  async () => {
    const db = admin.firestore();
    const configDoc = await db.collection('config').doc('bexioSync').get();
    const fromDate: string = configDoc.data()?.lastSyncedAt ?? '2000-01-01 00:00:00';
    await runInvoiceSync(fromDate, bexioTenantId.value(), 'scheduledBexioInvoiceSync');
  }
);
