import type { AppConfig, ProcessorEntry } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { INTEGRATION_KEYS, PROCESSOR_CATALOGUE, activeProcessors, outOfReachRows } from './processor.util';

/**
 * A config stub. Deliberately partial: legacy `app-config` docs carry neither
 * `integrations` nor `additionalProcessors`, and every selector must survive that.
 */
const config = (over: Partial<AppConfig> = {}) => ({ ...over }) as AppConfig;

/** Countries whose transfer needs no mechanism beyond CH domestic / EU adequacy. */
const NO_MECHANISM_NEEDED = ['CH', 'DE', 'IE', 'NL'];

describe('PROCESSOR_CATALOGUE', () => {
  it('has unique keys', () => {
    const keys = PROCESSOR_CATALOGUE.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every entry a legal entity, a purpose and a retention statement', () => {
    for (const p of PROCESSOR_CATALOGUE) {
      expect(p.legalEntity, `${p.key} has no legal entity`).not.toBe('');
      expect(p.retentionText, `${p.key} has no retention`).not.toBe('');
      expect(p.purposes.length, `${p.key} states no purpose`).toBeGreaterThan(0);
      expect(p.securityMeasures.length, `${p.key} states no security measures`).toBeGreaterThan(0);
      expect(p.dataClasses.length, `${p.key} names no data classes`).toBeGreaterThan(0);
    }
  });

  it('requires a transfer mechanism for every non-CH/EU processor', () => {
    for (const p of PROCESSOR_CATALOGUE.filter((x) => !NO_MECHANISM_NEEDED.includes(x.country))) {
      expect(p.transferMechanism, `${p.key} in ${p.country} has no mechanism`).not.toBe('none');
    }
  });

  it('covers all eight third-party destinations from inventory §4', () => {
    const keys = PROCESSOR_CATALOGUE.map((p) => p.key);
    for (const k of ['regasoft', 'bexio', 'deepsign', 'matrix', 'gemini', 'searchch', 'mailtrap', 'fcm']) {
      expect(keys, `inventory §4 lists ${k}`).toContain(k);
    }
  });

  it('covers the always-on platform layer', () => {
    const keys = PROCESSOR_CATALOGUE.map((p) => p.key);
    for (const k of ['firebase', 'sentry', 'imgix']) {
      expect(keys, `platform layer must list ${k}`).toContain(k);
    }
  });

  it('never ships a fabricated link — a url is either empty or absolute https', () => {
    for (const p of PROCESSOR_CATALOGUE) {
      for (const [field, url] of [['dpaUrl', p.dpaUrl], ['privacyUrl', p.privacyUrl]] as const) {
        if (url !== '') expect(url, `${p.key}.${field}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('exposes every gated key through INTEGRATION_KEYS, so audit check 6 has a comparison set', () => {
    const gated = PROCESSOR_CATALOGUE.filter((p) => !p.alwaysOn).map((p) => p.key);
    expect([...INTEGRATION_KEYS].sort()).toEqual(gated.sort());
  });
});

describe('activeProcessors', () => {
  it('drops a processor whose integration is disabled', () => {
    expect(activeProcessors(config()).map((p) => p.key)).not.toContain('deepsign');
  });

  it('drops a processor whose integration is explicitly false', () => {
    const c = config({ integrations: { deepsign: false } });
    expect(activeProcessors(c).map((p) => p.key)).not.toContain('deepsign');
  });

  it('includes it once the integration is enabled', () => {
    const c = config({ integrations: { deepsign: true } });
    expect(activeProcessors(c).map((p) => p.key)).toContain('deepsign');
  });

  it('always includes the always-on platform layer', () => {
    expect(activeProcessors(config()).map((p) => p.key)).toContain('firebase');
  });

  it('appends the tenant-added entries', () => {
    const extra = { key: 'treuhand', name: 'Treuhand AG' } as ProcessorEntry;
    const c = config({ additionalProcessors: [extra] });
    expect(activeProcessors(c).map((p) => p.key)).toContain('treuhand');
  });

  it('survives a legacy config carrying neither field', () => {
    expect(() => activeProcessors({} as AppConfig)).not.toThrow();
    expect(activeProcessors({} as AppConfig).length).toBeGreaterThan(0);
  });

  it('does not leak the enabledWhen predicate into the returned entry', () => {
    for (const p of activeProcessors(config())) {
      expect(p, `${p.key} still carries catalogue-only fields`).not.toHaveProperty('enabledWhen');
      expect(p, `${p.key} still carries catalogue-only fields`).not.toHaveProperty('alwaysOn');
    }
  });
});

describe('outOfReachRows', () => {
  it('lists only active processors, so a disabled integration is not claimed to hold data', () => {
    expect(outOfReachRows(config()).map((r) => r.key)).not.toContain('deepsign');
  });

  it('gives every row a contact the member can write to', () => {
    const c = config({ integrations: { deepsign: true } });
    for (const r of outOfReachRows(c)) {
      expect(r.contact, `${r.key} has no contact`).not.toBe('');
    }
  });

  it('speaks to the member, not the auditor — no row is a bare provider e-mail', () => {
    const c = config({ integrations: { deepsign: true, bexio: true, matrix: true } });
    for (const r of outOfReachRows(c)) {
      // The erasure report is read by a member deciding whether to delete their account.
      // `erasure-preview.spec.ts` enforces the same floor from the consuming side.
      expect(r.contact.length, `${r.key} reads like a register field, not advice`).toBeGreaterThan(20);
      expect(r.contact, `${r.key} is a bare e-mail address`).not.toMatch(/^\S+@\S+$/);
    }
  });

  it('carries the data classes so the member reads what each party actually holds', () => {
    const rows = outOfReachRows(config());
    expect(rows.find((r) => r.key === 'firebase')?.dataClasses.length).toBeGreaterThan(0);
  });
});
