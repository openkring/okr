import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, InvoiceCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { assertCallerIsAdmin } from '../collection/payment-method';
import { platformBilling } from '../collection/platform';
import { privateBucket } from '../_storage/private-bucket';
import { isTenantInvoice, myInvoiceViews, type MyBillingInvoice } from './my-invoices.logic';

const REGION = 'europe-west6';
const URL_TTL_MS = 10 * 60 * 1000;

/**
 * The tenant's own bkaiser invoices (operator books). The Firestore rules keep the operator books away from tenant
 * admins, so this projection is the only way a tenant reads them: its own invoices, nothing else.
 */
export const listMyBillingInvoices = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<MyBillingInvoice[]> => {
    const CF_NAME = 'listMyBillingInvoices';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const books = await platformBilling(db);

    const snap = await db.collection(InvoiceCollection)
      .where('tenants', 'array-contains', books.operatorTenantId)
      .where('accountingTenantId', '==', books.accountingTenantId)
      .where('isArchived', '==', false)
      .where('receiver.key', '==', tenantId)
      .get();
    return myInvoiceViews(snap.docs.map(d => ({ id: d.id, data: d.data() })), books.accountingTenantId, tenantId);
  },
);

/** A short-lived signed link to the PDF of one of the tenant's own bkaiser invoices. */
export const getMyBillingInvoicePdf = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ invoiceKey?: string }>): Promise<{ url: string }> => {
    const CF_NAME = 'getMyBillingInvoicePdf';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const invoiceKey = String(request.data?.invoiceKey ?? '');
    if (!invoiceKey) throw new HttpsError('invalid-argument', 'invoiceKey is required.');
    const books = await platformBilling(db);

    const inv = (await db.collection(InvoiceCollection).doc(invoiceKey).get()).data();
    if (!inv) throw new HttpsError('not-found', 'Invoice not found.');
    if (!isTenantInvoice(inv, books.accountingTenantId, tenantId)) {
      logger.error(`${CF_NAME}: tenant ${tenantId} asked for foreign invoice ${invoiceKey}`);
      throw new HttpsError('permission-denied', 'This invoice does not belong to your organisation.');
    }
    const documentKey = String(inv['documentKey'] ?? '');
    const doc = documentKey ? (await db.collection(FinanceDocumentCollection).doc(documentKey).get()).data() : undefined;
    const path = String(doc?.['fullPath'] ?? '');
    if (!path) throw new HttpsError('not-found', 'The invoice has no PDF.');
    const [url] = await privateBucket().file(path).getSignedUrl({
      version: 'v4', action: 'read', expires: Date.now() + URL_TTL_MS, responseDisposition: `inline; filename="rechnung-${invoiceKey}.pdf"`,
    });
    return { url };
  },
);
