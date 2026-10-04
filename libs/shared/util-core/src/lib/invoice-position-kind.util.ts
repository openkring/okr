/**
 * Kinds of invoice position (spec 1.84 K1/K2). `invoicePositionType` holds the fee-rule type of a
 * money position ('fix', 'rebate', …) or one of the layout kinds below. Layout lines carry no amount
 * and no account: they are invisible to every sum and booking. Shared by the invoice editor and the
 * invoice Cloud Functions.
 */
export const INVOICE_LAYOUT_POSITION_TYPES = ['text', 'subtotal', 'pageBreak'] as const;
export type InvoiceLayoutPositionType = typeof INVOICE_LAYOUT_POSITION_TYPES[number];

/** The type of a discount line (Rabatt); its stored amount is negative. */
export const INVOICE_REBATE_POSITION_TYPE = 'rebate';

/** True unless the position is a text, subtotal or page-break line; a legacy position without a type is money. */
export function isMoneyPosition(p: { type?: string } | undefined): boolean {
  return !(INVOICE_LAYOUT_POSITION_TYPES as readonly string[]).includes(p?.type ?? '');
}

/** True for a discount line (Rabatt). */
export function isRebatePosition(p: { type?: string } | undefined): boolean {
  return p?.type === INVOICE_REBATE_POSITION_TYPE;
}
