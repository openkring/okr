import { describe, expect, it } from 'vitest';

import { buildReportDocument, escapeHtml, formatReportAmount, ReportDocumentLabels, ReportDocumentOptions } from './report-document.html';
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
