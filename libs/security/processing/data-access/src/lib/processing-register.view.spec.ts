import { signal } from '@angular/core';
import type { AppConfig, ProcessorEntry } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { buildRegisterView } from './processing-register.view';

const config = (over: Partial<AppConfig> = {}) => ({ ...over }) as AppConfig;

const tenantEntry = (over: Partial<ProcessorEntry> = {}): ProcessorEntry => ({
  key: 'treuhand', name: 'Treuhand AG', legalEntity: 'Treuhand AG, Zürich, CH',
  role: 'processor', category: 'externalParty', country: 'CH', transferMechanism: 'domestic',
  purposes: ['Buchhaltung'], dataClasses: ['financial'], retentionText: '10 Jahre',
  securityMeasures: ['Vertraulichkeitsvereinbarung'], dpaUrl: '', privacyUrl: '',
  contact: 'info@treuhand.ch', ...over,
});

describe('buildRegisterView', () => {
  it('recomputes when the config signal changes', () => {
    const source = signal(config());
    const view = buildRegisterView(source);

    expect(view.entries().map((e) => e.key)).not.toContain('bexio');
    source.set(config({ integrations: { bexio: true } }));
    expect(view.entries().map((e) => e.key)).toContain('bexio');
  });

  it('returns undefined for an unknown key rather than throwing', () => {
    const view = buildRegisterView(signal(config()));
    expect(() => view.byKey('nope')()).not.toThrow();
    expect(view.byKey('nope')()).toBeUndefined();
  });

  it('resolves a known key to its entry', () => {
    const view = buildRegisterView(signal(config()));
    expect(view.byKey('firebase')()?.name).toContain('Firebase');
  });

  it('filters to tenant-added entries only when origin is "tenant"', () => {
    const source = signal(config({ additionalProcessors: [tenantEntry()] }));
    const view = buildRegisterView(source);

    const keys = view.filtered({ origin: 'tenant' })().map((e) => e.key);
    expect(keys).toEqual(['treuhand']);
    expect(keys).not.toContain('firebase');
  });

  it('filters to catalogue entries only when origin is "catalogue"', () => {
    const source = signal(config({ additionalProcessors: [tenantEntry()] }));
    const view = buildRegisterView(source);

    const keys = view.filtered({ origin: 'catalogue' })().map((e) => e.key);
    expect(keys).toContain('firebase');
    expect(keys).not.toContain('treuhand');
  });

  it('filters by category and by country, and combines the two', () => {
    const view = buildRegisterView(signal(config({ integrations: { bexio: true } })));

    expect(view.filtered({ category: 'infrastructure' })().every((e) => e.category === 'infrastructure')).toBe(true);
    expect(view.filtered({ country: 'CH' })().every((e) => e.country === 'CH')).toBe(true);
    expect(view.filtered({ category: 'saasService', country: 'CH' })().map((e) => e.key)).toContain('bexio');
    expect(view.filtered({ category: 'infrastructure', country: 'CH' })()).toEqual([]);
  });

  it('treats an empty filter as "everything"', () => {
    const view = buildRegisterView(signal(config()));
    expect(view.filtered({})().length).toBe(view.entries().length);
  });

  it('reports the countries and categories actually present, for the filter chips', () => {
    const view = buildRegisterView(signal(config({ integrations: { bexio: true } })));
    expect(view.countries()).toContain('CH');
    expect(view.countries()).toEqual([...view.countries()].sort());
    expect(view.categories()).toContain('infrastructure');
  });

  it('survives a legacy config with neither field', () => {
    const view = buildRegisterView(signal({} as AppConfig));
    expect(view.entries().length).toBeGreaterThan(0);
  });
});
