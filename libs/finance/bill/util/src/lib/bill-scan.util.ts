import { AvatarInfo, BillModel, OcrResultModel, OrgModel } from '@okr/shared-models';
import { fill, getAvatarInfo } from '@okr/shared-util-core';
import { billLinesTotal, newBillLine } from './bill-line.util';

/** The org whose name equals the creditor (case- and space-insensitive), as vendor; undefined when none or several match. */
export function vendorByName(orgs: OrgModel[], name: string): AvatarInfo | undefined {
  const norm = (s: string | undefined): string => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const n = norm(name);
  if (!n) return undefined;
  const hits = orgs.filter((o) => norm(o.name) === n);
  return hits.length === 1 ? getAvatarInfo(hits[0], 'org') : undefined;
}

export interface QrPrefill { iban: string; amount: number; currency: string; reference: string; creditorName: string; message: string; }

/** The QR-bill fields onto a new draft: title, vendor, IBAN, reference, one line (spec 1.91 §6). */
export function billFromQr(bill: BillModel, qr: QrPrefill, orgs: OrgModel[], accountKey: string): BillModel {
  bill.title = qr.creditorName;
  bill.vendor = vendorByName(orgs, qr.creditorName);
  bill.creditorIban = qr.iban;
  bill.paymentReference = qr.reference;
  bill.lines = [newBillLine(accountKey, qr.amount, qr.message || qr.creditorName)];
  return bill;
}

/** An ocr-results doc onto a new draft bill. Firestore reads skip model defaults, so every field is coalesced. */
export function billFromScan(r: OcrResultModel, ctx: { tenantId: string; accountingTenantId: string; orgs: OrgModel[];
  defaultAccountKey: string; today: string; currencyNote: string }): BillModel {
  const name = r.qrCreditorName || r.vendor || '';
  const currency = r.qrCurrency || r.currency || 'CHF';
  const qrAmount = r.qrAmount ?? -1;
  const bill = new BillModel(ctx.tenantId);
  bill.accountingTenantId = ctx.accountingTenantId;
  billFromQr(bill, {
    iban: r.qrIban || r.creditorIban || '',
    amount: qrAmount > 0 ? qrAmount : (r.grossAmount ?? 0),
    currency,
    reference: r.qrReference || r.reference || '',
    creditorName: name,
    message: r.qrMessage || r.subject || '',
  }, ctx.orgs, r.accountKey || ctx.defaultAccountKey);
  bill.lines[0].vatCodeKey = r.vatCodeKey ?? '';
  bill.lines[0].costCenterKey = r.costCenterKey ?? '';
  bill.billId = r.invoiceNumber ?? '';
  bill.billDate = r.invoiceDate || ctx.today;
  bill.dueDate = r.dueDate ?? '';
  const notes: string[] = [];
  if (r.subject && r.subject !== bill.lines[0].title) notes.push(r.subject);
  if (currency !== 'CHF') notes.push(fill(ctx.currencyNote, { currency }));
  bill.notes = notes.join('\n');
  return bill;
}

/** A draft or open bill that looks like the same invoice: same reference, or same vendor + amount + date (spec 1.91 Q5). */
export function billDuplicateHint(bill: BillModel, bills: BillModel[]): BillModel | undefined {
  const amount = billLinesTotal(bill.lines ?? []);
  return bills.find((b) => b.state !== 'paid' && b.okey !== bill.okey && (
    (!!bill.paymentReference && b.paymentReference === bill.paymentReference) ||
    (!!bill.vendor?.key && b.vendor?.key === bill.vendor.key && b.billDate === bill.billDate && (b.totalAmount?.amount ?? 0) === amount)
  ));
}
