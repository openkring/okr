import { describe, it, expect } from 'vitest';
import {
  FIREBASE_HOSTING_SUFFIX,
  resolveTenantAppUrl,
  buildSwitcherEntries,
  TenantConfigMeta,
} from './tenant-switcher.util';

describe('resolveTenantAppUrl', () => {
  it('derives the convention hosting URL when no domain is given', () => {
    expect(resolveTenantAppUrl('scs')).toBe(`https://scs-app-${FIREBASE_HOSTING_SUFFIX}.web.app`);
  });

  it('uses a bare custom domain with an https:// prefix', () => {
    expect(resolveTenantAppUrl('acme', 'acme.example.com')).toBe('https://acme.example.com');
  });

  it('leaves an already-qualified custom domain untouched', () => {
    expect(resolveTenantAppUrl('acme', 'https://acme.example.com')).toBe('https://acme.example.com');
  });

  it('falls back to the convention URL for an empty/whitespace domain', () => {
    expect(resolveTenantAppUrl('scs', '   ')).toBe(`https://scs-app-${FIREBASE_HOSTING_SUFFIX}.web.app`);
  });
});

describe('buildSwitcherEntries', () => {
  const configs = new Map<string, TenantConfigMeta>([
    ['scs', { appName: 'Seeclub Stäfa', logoUrl: 'tenant/scs/logo/logo_round.svg' }],
    ['acme', { appName: 'Acme', logoUrl: 'tenant/acme/logo/logo_round.svg', appDomain: 'acme.example.com' }],
  ]);

  it('marks the current tenant and lists it first', () => {
    const entries = buildSwitcherEntries(['acme', 'scs'], 'scs', configs);
    expect(entries.map((e) => e.tenantId)).toEqual(['scs', 'acme']);
    expect(entries[0].isCurrent).toBe(true);
    expect(entries[1].isCurrent).toBe(false);
  });

  it('resolves label, logo and url from config (custom domain honoured)', () => {
    const entries = buildSwitcherEntries(['acme'], 'scs', configs);
    expect(entries[0]).toMatchObject({
      tenantId: 'acme',
      label: 'Acme',
      logoUrl: 'tenant/acme/logo/logo_round.svg',
      url: 'https://acme.example.com',
      isCurrent: false,
    });
  });

  it('falls back to tenantId label and empty logo when config is missing', () => {
    const entries = buildSwitcherEntries(['ghost'], 'scs', configs);
    expect(entries[0]).toMatchObject({
      tenantId: 'ghost',
      label: 'ghost',
      logoUrl: '',
      url: `https://ghost-app-${FIREBASE_HOSTING_SUFFIX}.web.app`,
    });
  });

  it('dedupes tenant ids and drops empties', () => {
    const entries = buildSwitcherEntries(['scs', 'scs', ''], 'scs', configs);
    expect(entries).toHaveLength(1);
    expect(entries[0].tenantId).toBe('scs');
  });

  it('sorts non-current entries alphabetically by label', () => {
    const cfg = new Map<string, TenantConfigMeta>([
      ['b', { appName: 'Beta' }],
      ['a', { appName: 'Alpha' }],
    ]);
    const entries = buildSwitcherEntries(['b', 'a'], 'x', cfg);
    expect(entries.map((e) => e.label)).toEqual(['Alpha', 'Beta']);
  });
});
