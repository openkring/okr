import { AccountBookingRow, ReportRow, ReportRowKind } from './report.util';

/**
 * The printable Bilanz / Erfolgsrechnung — a self-contained HTML document handed to the existing
 * `generateDocument` Cloud Function (puppeteer HTML→PDF, see `DocGenerationService.printHtml`).
 * No second PDF mechanism is introduced.
 *
 * The table mirrors what the page shows: the same rows in the same order, the user's expand /
 * collapse state and the Nullzeilen toggle. A collapsed group therefore prints as its summary
 * line — the totals reconcile either way. The search term is deliberately NOT applied by the
 * caller: a document titled «Definitive Bilanz» that silently omitted the accounts somebody had
 * searched away would not be a statement.
 *
 * Pure and framework-free so it can be unit-tested; every label and every date arrives
 * pre-formatted from the caller (no i18n and no date helpers in a pure module).
 *
 * Every value is HTML-escaped: account names are typed by a treasurer, and puppeteer executes
 * what it is given.
 */

export type ReportVariant = 'final' | 'provisional';

export interface ReportDocumentLabels {
  /** Full heading, e.g. «Definitive Bilanz per 31.12.2024». */
  readonly title: string;
  /** Leading word of the top-right line, e.g. «Erstellt». */
  readonly created: string;
  readonly address: string;
  readonly period: string;
  /** e.g. «01.01.2024 bis 31.12.2024». */
  readonly periodValue: string;
  /** Optional own line below the period, e.g. «Buchhaltung: scs». */
  readonly books?: string;
  /** e.g. «Alle Beträge in CHF». */
  readonly amounts: string;
  /** Diagonal watermark drawn on every page of a provisional document. */
  readonly watermark: string;
  readonly colAccount: string;
  readonly colName: string;
  /** Column headers of the two amount columns, e.g. «2024» and «2023». */
  readonly colCurrent: string;
  readonly colPrevious: string;
}

export interface ReportDocumentOptions {
  readonly variant: ReportVariant;
  readonly orgName: string;
  /** One-line postal address, or `''` when the org has none (the line is then omitted). */
  readonly orgAddress: string;
  /** Rendered date, e.g. «08.09.2025». */
  readonly generatedOn: string;
  readonly labels: ReportDocumentLabels;
  /** false drops the previous-year column. Default true. */
  readonly showPrevious?: boolean;
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** de-CH thousands separator and two decimals, as the screen table shows them. */
export function formatReportAmount(minor: number): string {
  return (minor / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * One printed line: a report row, or a booking listed below an account row the user opened on the
 * page (`kind` 'booking', `date` pre-formatted). A ReportRow is a PrintableRow as it is.
 */
export interface PrintableRow {
  readonly kind: ReportRowKind | 'booking';
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly current: number;
  readonly previous: number;
  readonly date?: string;
}

/**
 * The rows as the page shows them: every report row, and below each account row in `openKeys` its
 * bookings from `details` (one tier deeper). `formatDate` renders a StoreDate.
 */
export function printableRows(
  rows: readonly ReportRow[], details: ReadonlyMap<string, readonly AccountBookingRow[]>, openKeys: ReadonlySet<string>,
  formatDate: (storeDate: string) => string,
): PrintableRow[] {
  return rows.flatMap((r): PrintableRow[] => {
    const bookings = r.kind === 'account' && openKeys.has(r.okey) ? details.get(r.okey) ?? [] : [];
    return [r, ...bookings.map(b => ({
      kind: 'booking' as const, id: '', name: b.title, depth: r.depth + 1, current: b.amount, previous: 0, date: formatDate(b.date),
    }))];
  });
}

/** One row of a report template's payload: everything pre-formatted, `indent` in px. */
export interface ReportTemplateRow {
  kind: ReportRowKind | 'booking';
  id: string;
  name: string;
  date: string;
  amount: string;
  indent: number;
}

/** The data a `report` template renders (Handlebars: `{{title}}`, `{{#each facts}}`, `{{#each rows}}` …). */
export interface ReportTemplatePayload {
  title: string;
  orgName: string;
  orgAddress: string;
  /** absolute raster URL of the org's logo; '' = none */
  logoUrl: string;
  created: string;
  generatedOn: string;
  facts: { label: string; value: string }[];
  amounts: string;
  columns: { account: string; name: string; amount: string };
  rows: ReportTemplateRow[];
  [key: string]: unknown;
}

export function reportTemplateRows(rows: readonly PrintableRow[]): ReportTemplateRow[] {
  return rows.map(r => ({
    kind: r.kind, id: r.id, name: r.name, date: r.date ?? '', amount: formatReportAmount(r.current), indent: r.depth * 12 + 6,
  }));
}

function row(r: PrintableRow, showPrevious: boolean): string {
  const indent = r.depth * 12;
  const date = r.date ? `<span class="date">${escapeHtml(r.date)}</span>` : '';
  return `<tr class="${r.kind}">
    <td class="account">${escapeHtml(r.id)}</td>
    <td class="name" style="padding-left:${indent + 6}px">${date}${escapeHtml(r.name)}</td>
    <td class="amount">${formatReportAmount(r.current)}</td>
    ${showPrevious ? `<td class="amount previous">${formatReportAmount(r.previous)}</td>` : ''}
  </tr>`;
}

export function buildReportDocument(rows: readonly PrintableRow[], options: ReportDocumentOptions): string {
  const l = options.labels;
  const showPrevious = options.showPrevious ?? true;
  const addressLine = options.orgAddress
    ? `${options.orgName}, ${options.orgAddress}`
    : options.orgName;
  const watermark = options.variant === 'provisional'
    ? `<div class="watermark">${escapeHtml(l.watermark)}</div>`
    : '';

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>${escapeHtml(l.title)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm 16mm 16mm; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; }
  .meta { text-align: right; font-size: 9pt; margin-bottom: 18mm; }
  h1 { font-size: 17pt; margin: 0 0 10mm 0; }
  .facts p { margin: 0 0 2mm 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8mm; }
  thead th { border-bottom: 1px solid #000; padding: 2mm 1mm; text-align: left; font-size: 9pt; }
  thead th.amount { text-align: right; }
  tbody td { padding: 1.2mm 1mm; vertical-align: top; }
  td.account { width: 16%; white-space: nowrap; }
  td.amount { width: 17%; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.previous { color: #555; }
  tr.group td { font-weight: 600; }
  tr.total td, tr.result td { font-weight: 700; border-top: 1px solid #000; }
  tr { break-inside: avoid; }
  tr.booking td { font-size: 8.5pt; color: #444; padding-top: 0.6mm; padding-bottom: 0.6mm; }
  span.date { display: inline-block; min-width: 18mm; font-variant-numeric: tabular-nums; }
  .watermark {
    position: fixed; top: 45%; left: 0; right: 0; text-align: center;
    font-size: 64pt; font-weight: 700; color: #000; opacity: 0.08;
    transform: rotate(-30deg); letter-spacing: 6pt; z-index: 0;
  }
  table, .facts, h1, .meta { position: relative; z-index: 1; }
</style>
</head>
<body>
${watermark}
<div class="meta">${escapeHtml(options.orgName)} - ${escapeHtml(l.created)}: ${escapeHtml(options.generatedOn)}</div>
<h1>${escapeHtml(l.title)}</h1>
<div class="facts">
  <p>${escapeHtml(l.address)}: ${escapeHtml(addressLine)}</p>
  <p>${escapeHtml(l.period)}: ${escapeHtml(l.periodValue)}</p>
  ${l.books ? `<p>${escapeHtml(l.books)}</p>` : ''}
  <p>${escapeHtml(l.amounts)}</p>
</div>
<table>
  <thead><tr>
    <th>${escapeHtml(l.colAccount)}</th>
    <th>${escapeHtml(l.colName)}</th>
    <th class="amount">${escapeHtml(l.colCurrent)}</th>
    ${showPrevious ? `<th class="amount">${escapeHtml(l.colPrevious)}</th>` : ''}
  </tr></thead>
  <tbody>${rows.map(r => row(r, showPrevious)).join('')}</tbody>
</table>
</body></html>`;
}
