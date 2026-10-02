import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { BankProfileCollection, PaymentCollection, PaymentOrderCollection, PaymentReferenceType } from '@okr/shared-models';
import { buildPain001Xml, normalizeIban, validateIban } from '@okr/finance-payment-util';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

const CF = 'generatePain001';

interface GeneratePain001Data {
  paymentOrderKey: string;
}

/**
 * Build the pain.001 payment file for an approved payment order and mark it transmitted.
 *
 * AUTHORIZATION (added 2026-08-24). This callable reads a payment order by key and both
 * RETURNS its full XML — creditor IBANs, amounts, references, the debtor account — and
 * FLIPS its status to `transmitted`. It previously required nothing but authentication,
 * and it trusted a client-supplied `accountingTenantId`, so any authenticated user of any
 * tenant could exfiltrate and consume another tenant's payment run. Three gates now:
 *
 *   1. `treasurer` (admin passes) — payment orders are finance data, not member data.
 *   2. the tenant comes from `users/{uid}.tenants[0]`, never from `request.data`.
 *   3. the order document must list that tenant.
 *
 * `accountingTenantId` is likewise taken from the ORDER, not the caller: it is a
 * second-level scope within the tenant, and reading it from the payload let a caller
 * widen or narrow which payments were pulled into someone else's file.
 */
export const generatePain001 = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<GeneratePain001Data>) => {
    checkAppCheckToken(request, CF);
    checkAuthentication(request, CF);
    await checkRoles(request, CF, ['treasurer']);
    const tenantId = await getCallerTenantId(request, CF);

    const { paymentOrderKey } = request.data;
    if (!paymentOrderKey) throw new HttpsError('invalid-argument', 'paymentOrderKey required');

    const db = admin.firestore();
    const orderSnap = await db.collection(PaymentOrderCollection).doc(paymentOrderKey).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', `Payment order ${paymentOrderKey} not found`);
    const order = orderSnap.data()!;

    // A read by document id never passes through the `tenants array-contains` filter that
    // guards every query — so the check has to happen here. 'not-found', not
    // 'permission-denied': whether the key exists in another tenant is itself a disclosure.
    if (!((order['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      logger.error(`${CF}: order ${paymentOrderKey} does not belong to tenant ${tenantId}`);
      throw new HttpsError('not-found', `Payment order ${paymentOrderKey} not found`);
    }

    if (order['status'] !== 'approved') throw new HttpsError('failed-precondition', 'Payment order must be approved before generating pain.001');

    const accountingTenantId = (order['accountingTenantId'] as string | undefined) ?? '';
    if (!accountingTenantId) {
      throw new HttpsError('failed-precondition', `Payment order ${paymentOrderKey} has no accountingTenantId`);
    }

    const paymentsSnap = await db.collection(PaymentCollection)
      .where('paymentOrderKey', '==', paymentOrderKey)
      .where('tenants', 'array-contains', tenantId)
      .get();
    const selected = paymentsSnap.docs.filter(d => (d.data()['accountingTenantId'] as string | undefined) === accountingTenantId);
    // Same selection as approvePaymentOrder; a payment that slipped in after approval blocks the run.
    if (selected.some(d => d.data()['status'] !== 'approved')) {
      throw new HttpsError('failed-precondition', 'all payments of the order must be approved');
    }
    const payments = selected.map(d => d.data());

    const debitAccountKey = (order['debitAccountKey'] as string | undefined) ?? '';
    const profile = await db.collection(BankProfileCollection)
      .where('accountKey', '==', debitAccountKey).where('tenants', 'array-contains', tenantId).limit(1).get();
    const debtorIban = normalizeIban((profile.docs[0]?.data()['iban'] as string | undefined) ?? '');
    if (!debtorIban || !validateIban(debtorIban)) throw new HttpsError('failed-precondition', 'debit account has no bank profile with an IBAN');
    const org = await db.collection('orgs').doc(tenantId).get();
    const debtorName = (org.data()?.['name'] as string | undefined) || tenantId;

    const xml = buildPain001Xml({
      msgId: order['messageId'] as string, executionDate: order['executionDate'] as string,
      debtorName, debtorIban, createdAt: new Date().toISOString(),
      payments: payments.map(p => ({
        endToEndId: (p['endToEndId'] as string) ?? '', amount: p['amount'] as { amount: number; currency: string } | undefined,
        recipientName: (p['recipientName'] as string) ?? '', recipientIban: (p['recipientIban'] as string) ?? '',
        recipientAddress: (p['recipientAddress'] as string) ?? '', reference: (p['reference'] as string) ?? '',
        referenceType: (p['referenceType'] as PaymentReferenceType | undefined) ?? '',
      })),
    });

    const batch = db.batch();
    batch.update(db.collection(PaymentOrderCollection).doc(paymentOrderKey), { pain001Xml: xml, status: 'transmitted' });
    selected.forEach(d => batch.update(d.ref, { status: 'transmitted' }));
    await batch.commit();
    logger.info(`${CF}: generated XML for order ${paymentOrderKey}, ${payments.length} payments (tenant=${tenantId})`);

    return { xml };
  }
);
