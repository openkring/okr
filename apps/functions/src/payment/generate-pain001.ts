import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

interface GeneratePain001Data {
  paymentOrderKey: string;
  accountingTenantId: string;
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

export const generatePain001 = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<GeneratePain001Data>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { paymentOrderKey, accountingTenantId } = request.data;
    if (!paymentOrderKey || !accountingTenantId) throw new HttpsError('invalid-argument', 'paymentOrderKey and accountingTenantId required');

    const db = admin.firestore();
    const orderSnap = await db.collection('payment-orders').doc(paymentOrderKey).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', `Payment order ${paymentOrderKey} not found`);
    const order = orderSnap.data()!;

    if (order['status'] !== 'approved') throw new HttpsError('failed-precondition', 'Payment order must be approved before generating pain.001');

    const paymentsSnap = await db.collection('payments')
      .where('paymentOrderKey', '==', paymentOrderKey)
      .where('accountingTenantId', '==', accountingTenantId)
      .get();
    const payments = paymentsSnap.docs.map(d => d.data());

    const xml = buildPain001Xml(order, payments, order['messageId'] as string, order['executionDate'] as string);

    await db.collection('payment-orders').doc(paymentOrderKey).update({ pain001Xml: xml, status: 'transmitted' });
    logger.info(`generatePain001: generated XML for order ${paymentOrderKey}, ${payments.length} payments`);

    return { xml };
  }
);
