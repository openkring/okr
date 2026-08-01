import type { PrivacyAuditResult, PrivacyFinding } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { buildAuditDocument } from './privacy-audit.html';

const finding = (over: Partial<PrivacyFinding> = {}): PrivacyFinding => ({
  checkId: 1, severity: 'error', titleDe: 'Sensible Felder', detailDe: 'Bitte korrigieren.',
  count: 3, sampleKeys: ['p1', 'p2'], fixRoute: '/person/all', ...over,
});

const result = (findings: PrivacyFinding[]): PrivacyAuditResult => ({
  tenantId: 'scs', ranAt: '20260801', findings, checksRun: 11,
});

const options = { tenantName: 'Seeclub Stäfa', generatedOn: '01.08.2026', cleanMessage: 'Keine Beanstandungen.' };

describe('buildAuditDocument', () => {
  it('renders one block per finding', () => {
    const html = buildAuditDocument(result([finding(), finding({ checkId: 4 })]), options);
    expect(html.match(/class="finding/g)?.length).toBe(2);
  });

  it('summarises the counts by severity', () => {
    const html = buildAuditDocument(result([
      finding({ severity: 'error' }), finding({ severity: 'warning' }), finding({ severity: 'info' }),
    ]), options);
    expect(html).toContain('<strong>1</strong> Fehler');
    expect(html).toContain('<strong>1</strong> Warnungen');
    expect(html).toContain('<strong>1</strong> Hinweise');
  });

  it('states how many checks ran, so a partial run is visible', () => {
    expect(buildAuditDocument(result([]), options)).toContain('11 Prüfungen');
  });

  it('says plainly when there is nothing to report', () => {
    expect(buildAuditDocument(result([]), options)).toContain('Keine Beanstandungen.');
  });

  it('shows the sample count against the total, never implying the samples are everything', () => {
    const html = buildAuditDocument(result([finding({ count: 25, sampleKeys: ['p1', 'p2'] })]), options);
    expect(html).toContain('2 von 25');
  });

  it('escapes sample keys — they come from live document ids', () => {
    const html = buildAuditDocument(result([finding({ sampleKeys: ['<script>alert(1)</script>'] })]), options);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('names the tenant and the date', () => {
    const html = buildAuditDocument(result([]), options);
    expect(html).toContain('Seeclub Stäfa');
    expect(html).toContain('01.08.2026');
  });
});
