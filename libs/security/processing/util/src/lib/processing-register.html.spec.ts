import type { ProcessorEntry } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { buildRegisterDocument, escapeHtml } from './processing-register.html';

const entry = (over: Partial<ProcessorEntry> = {}): ProcessorEntry => ({
  key: 'k', name: 'Anbieter AG', legalEntity: 'Anbieter AG, Zürich, CH',
  role: 'processor', category: 'saasService', country: 'CH', transferMechanism: 'domestic',
  purposes: ['Buchhaltung'], dataClasses: ['financial'], retentionText: '10 Jahre',
  securityMeasures: ['Verschlüsselung'], dpaUrl: 'https://example.ch/dpa',
  privacyUrl: 'https://example.ch/privacy', contact: 'datenschutz@example.ch', ...over,
});

const options = {
  tenantName: 'Seeclub Stäfa',
  generatedOn: '01.08.2026',
  controllerNote: 'Der Verein ist verantwortlich.',
};

describe('escapeHtml', () => {
  it('neutralises the characters that would break out of a text node or attribute', () => {
    expect(escapeHtml(`<script>"x"&'y'`)).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;');
  });

  it('survives a missing value', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });
});

describe('buildRegisterDocument', () => {
  it('renders one summary row and one detail block per entry', () => {
    const html = buildRegisterDocument([entry(), entry({ key: 'b', name: 'Zweite AG' })], options);
    expect(html.match(/class="entry"/g)?.length).toBe(2);
    expect(html).toContain('Anbieter AG');
    expect(html).toContain('Zweite AG');
  });

  it('names the tenant and the reporting date', () => {
    const html = buildRegisterDocument([entry()], options);
    expect(html).toContain('Seeclub Stäfa');
    expect(html).toContain('01.08.2026');
  });

  it('states who the controller is', () => {
    expect(buildRegisterDocument([], options)).toContain('Der Verein ist verantwortlich.');
  });

  it('marks a missing DPA rather than rendering an empty cell', () => {
    const html = buildRegisterDocument([entry({ dpaUrl: '' })], options);
    expect(html).toContain('nicht hinterlegt');
  });

  it('escapes tenant-typed values — an admin must not be able to inject markup', () => {
    // additionalProcessors is typed by a tenant admin, and puppeteer executes what it gets.
    const html = buildRegisterDocument([entry({ name: '<img src=x onerror=alert(1)>' })], options);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('escapes a hostile url instead of emitting it as an href', () => {
    const html = buildRegisterDocument([entry({ dpaUrl: '"><script>alert(1)</script>' })], options);
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('says so plainly when the tenant transfers to nobody', () => {
    expect(buildRegisterDocument([], options)).toContain('Keine aktiven Empfänger');
  });

  it('embeds the diagram when given one, and omits the section when not', () => {
    expect(buildRegisterDocument([entry()], { ...options, diagramSvg: '<svg id="m"></svg>' }))
      .toContain('<svg id="m"></svg>');
    expect(buildRegisterDocument([entry()], options)).not.toContain('Datenflüsse');
  });
});
