import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection } from '@okr/shared-models';

import { mayReadInvoice } from './invoice-access.logic';

/**
 * Throws unless the caller may read the documents of this invoice (see `mayReadInvoice`): admin,
 * treasurer, privileged, or the invoice's receiver. Shared by `showInvoicePdf` and
 * `createPaymentConfirmation` (a flat treasurer/privileged role check once rejected every member
 * opening their own invoice from /my-invoice, Sentry SCS-A0). Pass `invoice` when it is already loaded to save the read.
 */
export async function checkInvoiceReadAccess(
  request: CallableRequest, nameOfCallingFunction: string, invoiceKey: string, invoice?: Record<string, unknown>,
): Promise<void> {
  const uid = request.auth?.uid;
  if (!uid) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new HttpsError('unauthenticated', 'user must be authenticated.');
  }
  const db = getFirestore();
  const user = (await db.collection('users').doc(uid).get()).data();
  const roles = user?.['roles'] as Record<string, boolean> | undefined;
  const personKey = (user?.['personKey'] as string | undefined) ?? '';
  const adminClaim = request.auth?.token?.['admin'] === true;
  // a role alone admits; only a plain member needs the invoice's receiver
  if (mayReadInvoice({ adminClaim, roles, personKey: '', receiverKey: '' })) return;
  const data = invoice ?? (personKey ? (await db.collection(InvoiceCollection).doc(invoiceKey).get()).data() : undefined);
  const receiverKey = (data?.['receiver'] as { key?: string } | undefined)?.key ?? '';
  if (mayReadInvoice({ adminClaim, roles, personKey, receiverKey })) return;
  logger.error(`${nameOfCallingFunction}: user ${uid} may not read the documents of invoice ${invoiceKey}`);
  throw new HttpsError('permission-denied', 'This operation requires one of the roles: treasurer, privileged, or being the receiver of the invoice.');
}
