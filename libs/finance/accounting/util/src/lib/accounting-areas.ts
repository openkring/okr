import { AccountingI18nKey } from './accounting-i18n';

/**
 * The treasurer's accounting navigation (spec 1.100): eight work areas, each a list of segments
 * that point at EXISTING routes — the segment bar navigates between them, no URL changes.
 * Single source for the segment toolbar, the overview links and the menu catalogue's first urls.
 */
export type AccountingAreaId = 'overview' | 'journal' | 'payables' | 'receivables' | 'cost' | 'reports' | 'closing' | 'masterData';

export interface AccountingSegment {
  id: string;
  i18nKey: AccountingI18nKey;
  /** '{books}' is replaced by the accountingTenantId; absent for books-less routes */
  urlTemplate: string;
  /** the url belongs to this segment when one of these matches; group 1 = the books (if booksScoped) */
  matches: RegExp[];
  /** false: the route carries no books param (`/expense/all`, `/memberfees`) */
  booksScoped: boolean;
  /** hide unless this feature block is effective for the tenant */
  featureBlock?: string;
  /** hide while the books are not VAT-liable (`AccountingConfigModel.vatMethod === 'exempt'`) */
  requiresVat?: boolean;
}

export interface AccountingArea {
  id: AccountingAreaId;
  i18nKey: AccountingI18nKey;
  segments: AccountingSegment[];
}

export interface ResolvedAccountingArea {
  area: AccountingArea;
  segment: AccountingSegment;
  /** books from the url; undefined for books-less routes */
  books?: string;
}

const B = '([^/?#]+)';   // the books path segment
const END = '(?:[/?#]|$)';

function acc(path: string): RegExp {
  return new RegExp(`^/accounting/${B}/${path}${END}`);
}
function top(prefix: string): RegExp {
  return new RegExp(`^/${prefix}/${B}${END}`);
}

function seg(id: string, i18nKey: AccountingI18nKey, urlTemplate: string, matches: RegExp[], extra: Partial<AccountingSegment> = {}): AccountingSegment {
  return { id, i18nKey, urlTemplate, matches, booksScoped: true, ...extra };
}

export const ACCOUNTING_AREAS: readonly AccountingArea[] = [
  { id: 'overview', i18nKey: 'nav_area_overview', segments: [
    seg('overview', 'nav_area_overview', '/accounting/{books}/overview', [acc('overview')]),
  ] },
  { id: 'journal', i18nKey: 'nav_area_journal', segments: [
    seg('journal.bookings', 'nav_seg_bookings', '/accounting/{books}/journal/c-journal', [acc('journal')]),
    seg('journal.bankImport', 'nav_seg_bankImport', '/accounting-bank-import/{books}/bank-import-context', [top('accounting-bank-import')]),
  ] },
  { id: 'payables', i18nKey: 'nav_area_payables', segments: [
    seg('payables.bills', 'nav_seg_bills', '/accounting/{books}/bill/all/c-bill', [acc('bill')]),
    seg('payables.paymentOrders', 'nav_seg_paymentOrders', '/accounting/{books}/payments', [acc('payments')]),
    seg('payables.expenses', 'nav_seg_expenses', '/expense/all/c-expense', [/^\/expense\/all(?:[/?#]|$)/], { booksScoped: false }),
  ] },
  { id: 'receivables', i18nKey: 'nav_area_receivables', segments: [
    seg('receivables.invoices', 'nav_seg_invoices', '/accounting/{books}/invoice/all/c-invoice', [acc('invoice')]),
    seg('receivables.memberFees', 'nav_seg_memberFees', '/memberfees/c-memberfees', [/^\/memberfees(?:[/?#]|$)/], { booksScoped: false, featureBlock: 'member-fee' }),
    seg('receivables.aging', 'nav_seg_aging', '/accounting/{books}/aging', [acc('aging')]),
  ] },
  { id: 'cost', i18nKey: 'nav_area_cost', segments: [
    seg('cost.costCenters', 'nav_seg_costCenters', '/accounting/{books}/cost-center/c-cost-center', [acc('cost-center')]),
    seg('cost.budgets', 'nav_seg_budgets', '/accounting/{books}/budget/c-budget', [acc('budget')]),
    seg('cost.allocations', 'nav_seg_allocations', '/accounting/{books}/allocation/c-allocation', [acc('allocation')]),
  ] },
  { id: 'reports', i18nKey: 'nav_area_reports', segments: [
    seg('reports.balance', 'nav_seg_balance', '/accounting/{books}/balance/c-report', [acc('balance')]),
    seg('reports.incomeStatement', 'nav_seg_incomeStatement', '/accounting/{books}/income-statement/c-report', [acc('income-statement')]),
    seg('reports.cashFlow', 'nav_seg_cashFlow', '/accounting/{books}/cash-flow', [acc('cash-flow')]),
    seg('reports.openItems', 'nav_seg_openItems', '/accounting/{books}/open-items', [acc('open-items')]),
  ] },
  { id: 'closing', i18nKey: 'nav_area_closing', segments: [
    seg('closing.periods', 'nav_seg_periods', '/accounting/{books}/periods/c-period', [acc('periods')]),
    seg('closing.assets', 'nav_seg_assets', '/accounting/{books}/assets', [acc('assets')]),
    seg('closing.depreciation', 'nav_seg_depreciation', '/accounting/{books}/depreciation-run', [acc('depreciation-run')]),
  ] },
  { id: 'masterData', i18nKey: 'nav_area_masterData', segments: [
    seg('masterData.accounts', 'nav_seg_accounts', '/accounting/{books}/account/c-account', [acc('account')]),
    seg('masterData.vatCodes', 'nav_seg_vatCodes', '/accounting/{books}/vat-codes', [acc('vat-codes')], { requiresVat: true }),
    seg('masterData.bankProfiles', 'nav_seg_bankProfiles', '/accounting-bank-profiles/{books}/bank-profile-context', [top('accounting-bank-profiles')]),
    seg('masterData.bankRules', 'nav_seg_bankRules', '/accounting-bank-rules/{books}/bank-rule-context', [top('accounting-bank-rules')]),
    seg('masterData.ocrRules', 'nav_seg_ocrRules', '/accounting-ocr-rules/{books}/ocr-rule-context', [top('accounting-ocr-rules')]),
    seg('masterData.settings', 'nav_seg_settings', '/accounting/{books}/settings', [acc('settings')]),
  ] },
];

/** The area and segment a url belongs to; undefined outside the treasurer's accounting screens. */
export function resolveAccountingArea(url: string): ResolvedAccountingArea | undefined {
  if (!url) return undefined;
  for (const area of ACCOUNTING_AREAS) {
    for (const segment of area.segments) {
      for (const re of segment.matches) {
        const m = re.exec(url);
        if (m) return { area, segment, books: segment.booksScoped ? decodeURIComponent(m[1]) : undefined };
      }
    }
  }
  return undefined;
}

/** The url of a segment for the given books. */
export function segmentUrl(segment: AccountingSegment, books: string): string {
  return segment.urlTemplate.replace('{books}', encodeURIComponent(books));
}
