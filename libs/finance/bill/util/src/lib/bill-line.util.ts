import { BillLine, BillModel } from '@okr/shared-models';

/** writeBill keeps at most this many lines (server: MAX_BILL_LINES). */
export const MAX_BILL_LINES = 50;
/** writeBill caps a line title here (server: MAX_LINE_TITLE_LENGTH). */
export const BILL_LINE_TITLE_LENGTH = 200;
/** QR reference: 27 digits (QRR) or up to 25 characters (SCOR); room for spacing. */
export const BILL_REFERENCE_LENGTH = 40;
/** An IBAN has at most 34 characters. */
export const BILL_IBAN_LENGTH = 34;

/** A new, empty bill line on `accountKey` (the books' default expense account, or ''). */
export function newBillLine(accountKey = '', amount = 0, title = ''): BillLine {
  return { title, accountKey, amount, vatCodeKey: '', costCenterKey: '' };
}

/** Σ line amounts in Rappen. */
export function billLinesTotal(lines: Pick<BillLine, 'amount'>[]): number {
  return (lines ?? []).reduce((s, l) => s + (l?.amount ?? 0), 0);
}

/** A native bill that may still be changed: a draft without its booking (legacy docs may lack the fields). */
export function isDraftBill(bill: Pick<BillModel, 'state' | 'bookingKeys'> | undefined): boolean {
  return bill?.state === 'draft' && (bill.bookingKeys ?? []).length === 0;
}

/** The editable copy of a bill's lines (legacy docs lack `lines`). */
export function toBillLines(bill: Pick<BillModel, 'lines'> | undefined): BillLine[] {
  return (bill?.lines ?? []).map((l) => ({
    title: l.title ?? '', accountKey: l.accountKey ?? '', amount: l.amount ?? 0, vatCodeKey: l.vatCodeKey ?? '', costCenterKey: l.costCenterKey ?? '',
  }));
}
