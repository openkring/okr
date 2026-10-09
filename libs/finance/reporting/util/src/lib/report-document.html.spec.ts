import { describe, expect, it } from 'vitest';

import { buildReportDocument, escapeHtml, formatReportAmount, printableRows, ReportDocumentLabels, ReportDocumentOptions, reportTemplateRows } from './report-document.html';
import { ReportRow } from './report.util';

function row(partial: Partial<ReportRow>): ReportRow {
  return {
    okey: 'k', id: '1000', name: 'Kasse', depth: 0, kind: 'account',
    hasChildren: false, isExpanded: false, current: 0, previous: 0, ...partial,
  };
}

const LABELS: ReportDocumentLabels = {
  title: 'Definitive Bilanz per 31.12.2024',
  created: 'Erstellt',
  address: 'Adresse',
  period: 'Periode',
  periodValue: '01.01.2024 bis 31.12.2024',
  amounts: 'Alle Beträge in CHF',
  watermark: 'PROVISORISCH',
  colAccount: 'Konto',
  colName: 'Bezeichnung',
  colCurrent: '2024',
  colPrevious: '2023',
};

function options(partial: Partial<ReportDocumentOptions> = {}): ReportDocumentOptions {
  return {
    variant: 'final',
    orgName: 'bkaiser GmbH',
    orgAddress: 'Rainstr. 65, 8712 Stäfa',
    generatedOn: '08.09.2025',
    labels: LABELS,
    ...partial,
  };
}

describe('escapeHtml', () => {
  it('escapes the five markup characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('formatReportAmount', () => {
  // The de-CH thousands separator is whatever the runtime's ICU supplies (a straight or a
  // typographic apostrophe) — assert the shape, not the glyph.
  it('renders minor units as de-CH francs with two decimals', () => {
    expect(formatReportAmount(123456)).toMatch(/^1.234\.56$/);
    expect(formatReportAmount(0)).toBe('0.00');
    expect(formatReportAmount(-500)).toBe('-5.00');
  });
});

describe('buildReportDocument', () => {
  it('renders the header block of the attached Bilanz', () => {
    const html = buildReportDocument([], options());
    expect(html).toContain('bkaiser GmbH - Erstellt: 08.09.2025');
    expect(html).toContain('<h1>Definitive Bilanz per 31.12.2024</h1>');
    expect(html).toContain('Adresse: bkaiser GmbH, Rainstr. 65, 8712 Stäfa');
    expect(html).toContain('Periode: 01.01.2024 bis 31.12.2024');
    expect(html).toContain('Alle Beträge in CHF');
  });

  it('omits the street part when the org has no postal address', () => {
    const html = buildReportDocument([], options({ orgAddress: '' }));
    expect(html).toContain('Adresse: bkaiser GmbH<');
  });

  it('prints one row per report row, in order, with both amount columns', () => {
    const html = buildReportDocument([
      row({ okey: 'a', id: '1', name: 'Aktiven', kind: 'group', hasChildren: true, current: 100000, previous: 90000 }),
      row({ okey: 'b', id: '1000', name: 'Kasse', depth: 1, current: 100000, previous: 90000 }),
      row({ okey: 't', id: '', name: 'Total Aktiven', kind: 'total', current: 100000, previous: 90000 }),
    ], options());
    const names = [...html.matchAll(/<td class="name"[^>]*>([^<]*)</g)].map(m => m[1]);
    expect(names).toEqual(['Aktiven', 'Kasse', 'Total Aktiven']);
    expect(html).toMatch(/<td class="amount">1.000\.00<\/td>/);
    expect(html).toContain('<td class="amount previous">900.00</td>');
  });

  it('indents by depth and keeps the row kind as a class', () => {
    const html = buildReportDocument([row({ depth: 2, kind: 'group', hasChildren: true })], options());
    expect(html).toContain('padding-left:30px');
    expect(html).toContain('<tr class="group">');
  });

  it('draws the watermark only on a provisional document', () => {
    expect(buildReportDocument([], options({ variant: 'provisional' })))
      .toContain('<div class="watermark">PROVISORISCH</div>');
    expect(buildReportDocument([], options())).not.toContain('class="watermark"');
  });

  it('escapes account names and the org name', () => {
    const html = buildReportDocument(
      [row({ name: '<script>alert(1)</script>' })],
      options({ orgName: 'A & B' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
  });
});

describe('printableRows', () => {
  const rows = [row({ okey: 'g', kind: 'group', id: '6', name: 'Aufwand', current: 700 }),
    row({ okey: 'a', id: '6000', name: 'Miete', depth: 1, current: 500 }), row({ okey: 'b', id: '6100', name: 'Strom', depth: 1, current: 200 })];
  const details = new Map([
    ['a', [{ bookingKey: 'x', date: '20260501', bookingNo: 1, title: 'Mai', amount: 500 }]],
    ['b', [{ bookingKey: 'y', date: '20260502', bookingNo: 2, title: 'Juni', amount: 200 }]],
  ]);
  const printed = printableRows(rows, details, new Set(['a']), d => `${d.slice(6)}.${d.slice(4, 6)}.${d.slice(0, 4)}`);

  it('lists the bookings of opened accounts only, one tier deeper', () => {
    expect(printed.map(r => [r.kind, r.name, r.depth, r.date ?? ''])).toEqual([
      ['group', 'Aufwand', 0, ''], ['account', 'Miete', 1, ''], ['booking', 'Mai', 2, '01.05.2026'], ['account', 'Strom', 1, ''],
    ]);
  });
  it('prints the booking rows with their date, escaped', () => {
    const html = buildReportDocument(printableRows(rows, new Map([['a', [{ bookingKey: 'x', date: '20260501', bookingNo: 1, title: '<b>', amount: 5 }]]]), new Set(['a']), d => d),
      options({ showPrevious: false }));
    expect(html).toContain('<tr class="booking">');
    expect(html).toContain('<span class="date">20260501</span>&lt;b&gt;');
  });
  it('formats the template rows', () => {
    expect(reportTemplateRows(printed)[2]).toEqual({ kind: 'booking', id: '', name: 'Mai', date: '01.05.2026', amount: formatReportAmount(500), indent: 30 });
  });
});

describe('books line', () => {
  it('stands on its own line when given, and is left out otherwise', () => {
    expect(buildReportDocument([], options({ labels: { ...LABELS, books: 'Buchhaltung: scs' } }))).toContain('<p>Buchhaltung: scs</p>');
    expect(buildReportDocument([], options())).not.toContain('Buchhaltung');
  });
});
