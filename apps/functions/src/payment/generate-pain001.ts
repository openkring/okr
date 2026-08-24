import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { PaymentCollection, PaymentOrderCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

const CF = 'generatePain001';

interface GeneratePain001Data {
  paymentOrderKey: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPain001Xml(order: Record<string, unknown>, payments: Record<string, unknown>[], msgId: string, executionDate: string): string {
  const isoDate = executionDate.length === 8
    ? convertDateFormatToString(executionDate, DateFormat.StoreDate, DateFormat.IsoDate)
    : executionDate;

  const cdtTrfTxInf = payments.map((p: any) => `
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${p.endToEndId ?? ''}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="${(p.amount as any)?.currency ?? 'CHF'}">${((p.amount as any)?.amount ?? 0) / 100}</InstdAmt></Amt>
      <Cdtr><Nm>${escapeXml(p.recipientName as string ?? '')}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${p.recipientIban ?? ''}</IBAN></Id></CdtrAcct>
      <RmtInf><Ustrd>${escapeXml(p.reference as string ?? '')}</Ustrd></RmtInf>
    </CdtTrfTxInf>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${payments.reduce((s: number, p: any) => s + ((p.amount as any)?.amount ?? 0), 0) / 100}</CtrlSum>
      <InitgPty><Nm>bk2</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt><Dt>${isoDate}</Dt></ReqdExctnDt>
      <Dbtr><Nm>Debtor</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${order['debitAccountKey'] ?? ''}</IBAN></Id></DbtrAcct>
      ${cdtTrfTxInf}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
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
      .where('accountingTenantId', '==', accountingTenantId)
      .get();
    const payments = paymentsSnap.docs.map(d => d.data());

    const xml = buildPain001Xml(order, payments, order['messageId'] as string, order['executionDate'] as string);

    await db.collection(PaymentOrderCollection).doc(paymentOrderKey).update({ pain001Xml: xml, status: 'transmitted' });
    logger.info(`${CF}: generated XML for order ${paymentOrderKey}, ${payments.length} payments (tenant=${tenantId})`);

    return { xml };
  }
);
