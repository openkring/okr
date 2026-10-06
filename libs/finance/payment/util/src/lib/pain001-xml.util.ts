import { PaymentReferenceType } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { normalizeIban } from './iban.util';
import { detectPaymentType } from './pain001.util';

export interface Pain001Payment {
  endToEndId: string;
  amount: { amount: number; currency: string } | undefined;
  recipientName: string;
  recipientIban: string;
  recipientAddress: string;
  reference: string;
  referenceType?: PaymentReferenceType;
}

export interface Pain001Input {
  msgId: string;
  /** StoreDate yyyymmdd or ISO yyyy-mm-dd */
  executionDate: string;
  debtorName: string;
  debtorIban: string;
  /** BIC of the debtor's bank; omitted → <DbtrAgt> carries Othr/Id NOTPROVIDED (IBAN-only debit) */
  debtorBic?: string;
  payments: Pain001Payment[];
  /** ISO timestamp for CreDtTm — passed in so the output is deterministic under test */
  createdAt: string;
}

export interface RecipientAddress { street: string; zip: string; town: string; country: string; }

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (cents: number): string => (cents / 100).toFixed(2);

/**
 * A structured address from the free-text `recipientAddress` (lines or comma-separated parts).
 * Needs a "zip town" part; the country is a 2-letter part, else CH for a 4-digit zip. undefined
 * when nothing structured can be recovered — the caller then omits <PstlAdr>.
 */
export function parseRecipientAddress(address: string): RecipientAddress | undefined {
  const parts = (address ?? '').split(/\r?\n|,/).map(p => p.trim()).filter(Boolean);
  const zipIdx = parts.findIndex(p => /^\d{4,5}\s+\S/.test(p));
  if (zipIdx < 0) return undefined;
  const [, zip, town] = parts[zipIdx].match(/^(\d{4,5})\s+(.+)$/) ?? [];
  const countryPart = parts.find(p => /^[A-Z]{2}$/.test(p));
  const country = countryPart ?? (zip.length === 4 ? 'CH' : '');
  if (!country) return undefined;
  const street = parts.find((p, i) => i !== zipIdx && p !== countryPart) ?? '';
  return { street, zip, town: town.trim(), country };
}

function remittance(p: Pain001Payment): string {
  const type = p.referenceType || detectPaymentType(p.recipientIban, p.amount?.currency ?? 'CHF', p.reference);
  const ref = (p.reference ?? '').replace(/\s+/g, '').toUpperCase();
  // A structured reference without a value is invalid (<Ref> must not be empty): send it unstructured.
  if (type === 'QRR' && ref) {
    return `<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Prtry>QRR</Prtry></CdOrPrtry></Tp><Ref>${escapeXml(ref)}</Ref></CdtrRefInf></Strd></RmtInf>`;
  }
  if (type === 'SCOR' && ref) {
    return `<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry></Tp><Ref>${escapeXml(ref)}</Ref></CdtrRefInf></Strd></RmtInf>`;
  }
  return `<RmtInf><Ustrd>${escapeXml(p.reference ?? '')}</Ustrd></RmtInf>`;
}

function postalAddress(address: string): string {
  const a = parseRecipientAddress(address);
  if (!a) return '';
  const street = a.street ? `<StrtNm>${escapeXml(a.street)}</StrtNm>` : '';
  return `<PstlAdr>${street}<PstCd>${escapeXml(a.zip)}</PstCd><TwnNm>${escapeXml(a.town)}</TwnNm><Ctry>${a.country}</Ctry></PstlAdr>`;
}

/** <DbtrAgt> is mandatory in pain.001.001.09; without a known BIC the Swiss IG allows Othr/Id NOTPROVIDED. */
function debtorAgent(bic: string | undefined): string {
  const b = (bic ?? '').replace(/\s+/g, '').toUpperCase();
  const id = b ? `<BICFI>${escapeXml(b)}</BICFI>` : '<Othr><Id>NOTPROVIDED</Id></Othr>';
  return `<DbtrAgt><FinInstnId>${id}</FinInstnId></DbtrAgt>`;
}

/**
 * The pain.001.001.09 document for one payment order (spec 1.80 §5.2). Pure.
 * BtchBookg=false asks the bank for one debit per payment instead of one collective debit per order,
 * so the bank statement import can match each debit to its bill (amount, reference).
 */
export function buildPain001Xml(input: Pain001Input): string {
  const isoDate = input.executionDate.length === 8
    ? convertDateFormatToString(input.executionDate, DateFormat.StoreDate, DateFormat.IsoDate)
    : input.executionDate;
  const total = input.payments.reduce((s, p) => s + (p.amount?.amount ?? 0), 0);

  const txs = input.payments.map(p => `
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${escapeXml(p.endToEndId)}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="${p.amount?.currency ?? 'CHF'}">${money(p.amount?.amount ?? 0)}</InstdAmt></Amt>
      <Cdtr><Nm>${escapeXml(p.recipientName)}</Nm>${postalAddress(p.recipientAddress)}</Cdtr>
      <CdtrAcct><Id><IBAN>${normalizeIban(p.recipientIban)}</IBAN></Id></CdtrAcct>
      ${remittance(p)}
    </CdtTrfTxInf>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(input.msgId)}</MsgId>
      <CreDtTm>${input.createdAt}</CreDtTm>
      <NbOfTxs>${input.payments.length}</NbOfTxs>
      <CtrlSum>${money(total)}</CtrlSum>
      <InitgPty><Nm>${escapeXml(input.debtorName)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(input.msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <ReqdExctnDt><Dt>${isoDate}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${escapeXml(input.debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${normalizeIban(input.debtorIban)}</IBAN></Id></DbtrAcct>
      ${debtorAgent(input.debtorBic)}
      ${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}
