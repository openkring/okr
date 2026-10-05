import { BankImportRowModel, BillModel } from '@okr/shared-models';
import { findQrReference, getFullName, normalizeQrReference } from '@okr/shared-util-core';

/** A vendor name shorter than this is too unspecific to be searched for in a bank text. */
const MIN_VENDOR_NAME_LENGTH = 3;

const PAYABLE_STATES = ['todo', 'overdue'];

/** Rappen still open on a bill (legacy docs may lack `payments`). */
function openAmount(bill: BillModel): number {
  const paid = (bill.payments ?? []).reduce((s, p) => s + (p?.amount ?? 0), 0);
  return Math.max(0, (bill.totalAmount?.amount ?? 0) - paid);
}

function vendorName(bill: BillModel): string {
  const v = bill.vendor;
  return v ? (v.label || getFullName(v.name1, v.name2) || '').trim() : '';
}

const squeeze = (s: string): string => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Links outgoing bank debits to the open bills they pay (spec 1.85 phase 2), the debit-side twin of
 * `matchInvoicePayments`:
 * (a) by QR reference (camt `paymentReference` or a reference found in the text) when exactly one open
 *     bill of the books carries it, else
 * (b) by amount and vendor: the debit equals the open amount of exactly one open bill whose vendor name
 *     appears in the bank text or payee.
 * A match sets `billKey` and the title and, when `payablesAccountKey` is given, assigns the payables
 * account (Kreditoren): the expense was booked with the bill, so a rule's expense account would book it
 * twice. Credits, posted rows, rows already linked to an invoice or bill, and manual assignments (no
 * rule, account set) stay untouched; each bill is used once.
 */
export function matchBillPayments(
  rows: BankImportRowModel[],
  bills: BillModel[],
  opts: { titlePrefix: string; payablesAccountKey: string },
): { rows: BankImportRowModel[]; matched: number } {
  const open = bills.filter((b) => !!b.okey && PAYABLE_STATES.includes(b.state) && openAmount(b) > 0);
  const used = new Set<string>();
  let matched = 0;
  const out = rows.map((r) => {
    if (r.status === 'posted' || r.invoiceKey || r.billKey || (r.amount?.amount ?? 0) >= 0) return r;
    if ((r.ruleKey ?? '') === '' && (r.accountKey ?? '') !== '') return r;
    const books = open.filter((b) => b.accountingTenantId === r.accountingTenantId && !used.has(b.okey));

    let bill: BillModel | undefined;
    const ref = normalizeQrReference(r.paymentReference) || findQrReference(r.rawText);
    if (ref) {
      const byRef = books.filter((b) => normalizeQrReference(b.paymentReference) === ref);
      if (byRef.length === 1) bill = byRef[0];
    }
    if (!bill) {
      const amount = Math.abs(r.amount.amount);
      const text = squeeze(`${r.rawText ?? ''} ${r.payee ?? ''}`);
      const byAmount = books.filter((b) => {
        const name = squeeze(vendorName(b));
        return openAmount(b) === amount && name.length >= MIN_VENDOR_NAME_LENGTH && text.includes(name);
      });
      if (byAmount.length === 1) bill = byAmount[0];
    }
    if (!bill) return r;

    used.add(bill.okey);
    matched += 1;
    const linked: BankImportRowModel = {
      ...r,
      billKey: bill.okey,
      title: `${opts.titlePrefix} ${bill.billId} ${vendorName(bill)}`.replace(/\s+/g, ' ').trim(),
    };
    if (!opts.payablesAccountKey) return linked;
    return { ...linked, accountKey: opts.payablesAccountKey, vatCodeKey: '', ruleKey: '', splits: [], status: 'mapped' as const };
  });
  return { rows: out, matched };
}
