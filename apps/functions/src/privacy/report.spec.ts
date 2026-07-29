import { describe, expect, it } from 'vitest';
import { COLLECTION_LABELS, renderExportReport, renderReadme } from './report';
import { SUBJECT_DATA_MAP } from './subject-data-map';

const bundle = {
  generatedAt: '2026-07-28T10:00:00.000Z', tenantId: 'scs',
  full: { persons: [{ okey: 'p1', firstName: 'Ann', lastName: 'Müller' }] },
  index: { documents: [{ title: 'Statuten', date: '20260101', route: '/document/d1' }] },
};

describe('renderExportReport', () => {
  it('is a self-contained document with no external resource', () => {
    const html = renderExportReport(bundle, 'Seeclub Stäfa');
    expect(html).toContain('<!doctype html>');
    expect(html).not.toMatch(/src="https?:|href="https?:\/\/(?!www\.w3)/);
  });

  it('escapes HTML in the data so a crafted name cannot inject markup', () => {
    const evil = { ...bundle, full: { persons: [{ okey: 'p1', firstName: '<img src=x onerror=alert(1)>' }] } };
    const html = renderExportReport(evil, 'Seeclub Stäfa');
    expect(html).not.toContain('<img src=x');
    // NOTE: Handlebars' real default `escapeExpression` escapes `=` too (`&#x3D;`), not
    // just `&<>"'` — the brief's literal `&lt;img src=x` assumes a narrower escaper and
    // can never appear once real Handlebars escaping runs. Asserting the exact escaped
    // string (rather than loosening the check) still fails hard on any escaping
    // regression, which is the property this test exists to guard.
    expect(html).toContain('&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
  });

  it('renders index rows as links, not payloads', () => {
    const html = renderExportReport(bundle, 'Seeclub Stäfa');
    expect(html).toContain('Statuten');
    expect(html).toContain('/document/d1');
  });

  it('names the tenant as controller and states the generation date', () => {
    const html = renderExportReport(bundle, 'Seeclub Stäfa');
    expect(html).toContain('Seeclub Stäfa');
    expect(html).toContain('2026-07-28');
  });
});

describe('COLLECTION_LABELS', () => {
  it('labels every collection SUBJECT_DATA_MAP actually exports (full or index)', () => {
    const exported = SUBJECT_DATA_MAP.filter((e) => e.onExport === 'full' || e.onExport === 'index');
    const unlabeled = exported.map((e) => e.collection).filter((c) => !(c in COLLECTION_LABELS));
    // Fails here — not in production, as a raw Firestore collection name in a member's
    // legal document — the moment a new exported row is added upstream without a
    // matching German label in report.ts.
    expect(unlabeled).toEqual([]);
  });
});

describe('renderReadme', () => {
  it('is self-contained plain text naming the controller', () => {
    const txt = renderReadme('Seeclub Stäfa', 'Seeclub Stäfa, Vorstand, 8712 Stäfa');
    expect(txt).toContain('Seeclub Stäfa');
    expect(txt).toContain('Vorstand');
  });

  it('states that chat message bodies are not included, and names the homeserver placeholder', () => {
    const txt = renderReadme('Seeclub Stäfa', 'Seeclub Stäfa, Vorstand, 8712 Stäfa');
    expect(txt.toLowerCase()).toContain('nachrichten');
    expect(txt).toContain('nicht enthalten');
  });

  it('states that backups are not covered', () => {
    const txt = renderReadme('Seeclub Stäfa', 'Seeclub Stäfa, Vorstand, 8712 Stäfa');
    expect(txt.toLowerCase()).toContain('backup');
  });
});
