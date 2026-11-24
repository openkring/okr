import type { AppConfig } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { emailProviderLabel, integrationRows, processorNames, takenAppDomains, tenantChoices, withIntegration } from './tenant-settings-operator';

const doc = (okey: string, patch: Record<string, unknown> = {}) => ({ okey, ...patch }) as Partial<AppConfig> & { okey: string };

describe('tenantChoices', () => {
  it('shows name and id, sorted by name', () => {
    expect(tenantChoices([doc('scs', { appName: 'Seeclub' }), doc('bka', { appName: 'Bkaiser' })], 'arch')).toEqual([
      { id: 'bka', label: 'Bkaiser (bka)' }, { id: 'scs', label: 'Seeclub (scs)' },
    ]);
  });
  it('shows the id when there is no usable name', () => {
    expect(tenantChoices([doc('a'), doc('b', { appName: '  ' }), doc('c', { appName: 3 })], 'arch').map((t) => t.label)).toEqual(['a', 'b', 'c']);
  });
  it('lists an archived tenant with the mark, and nothing without an id', () => {
    expect(tenantChoices([doc('x', { appName: 'X', isArchived: true }), doc('')], 'archiviert')).toEqual([{ id: 'x', label: 'X (x), archiviert' }]);
  });
});

describe('takenAppDomains', () => {
  it('lists the domains of the other tenants, comparable, archived ones too', () => {
    const configs = [doc('a', { appDomain: 'app.a.ch' }), doc('b', { appDomain: ' App.B.ch ', isArchived: true }), doc('c', { appDomain: '' }), doc('d'), doc('e', { appDomain: 3 })];
    expect(takenAppDomains(configs, 'a')).toEqual(['app.b.ch']);
    expect(takenAppDomains(configs, 'x')).toEqual(['app.a.ch', 'app.b.ch']);
  });
});

describe('emailProviderLabel', () => {
  it('marks the test service', () => {
    expect(emailProviderLabel('mailtrap_test', 'Test')).toBe('mailtrap_test (Test)');
    expect(emailProviderLabel('mailtrap_api', 'Test')).toBe('mailtrap_api');
  });
});

const OPTIONS = [{ key: 'bexio', name: 'Bexio' }, { key: 'matrix', name: 'Matrix' }];

describe('integrationRows', () => {
  it('has a line per known service and then the unknown stored keys', () => {
    expect(integrationRows({ matrix: true, zz: true, aa: false, bexio: 'yes' }, OPTIONS)).toEqual([
      { key: 'bexio', name: 'Bexio', on: false, known: true },
      { key: 'matrix', name: 'Matrix', on: true, known: true },
      { key: 'aa', name: 'aa', on: false, known: false },
      { key: 'zz', name: 'zz', on: true, known: false },
    ]);
  });
  it('survives a missing or broken value', () => {
    for (const stored of [undefined, null, [], 'x']) expect(integrationRows(stored, OPTIONS).map((r) => r.on)).toEqual([false, false]);
  });
});

describe('withIntegration', () => {
  it('switches one key and keeps the others, unknown ones too', () => {
    expect(withIntegration({ zz: true, bexio: true }, { zz: true, bexio: true }, 'bexio', false)).toEqual({ zz: true, bexio: false });
    expect(withIntegration({ zz: true }, { zz: true }, 'matrix', true)).toEqual({ zz: true, matrix: true });
  });
  it('is unchanged after switching on and off a key that was not stored', () => {
    const on = withIntegration({ zz: true }, { zz: true }, 'matrix', true);
    expect(withIntegration(on, { zz: true }, 'matrix', false)).toEqual({ zz: true });
  });
  it('starts from nothing when nothing usable is stored', () => expect(withIntegration(undefined, null, 'matrix', true)).toEqual({ matrix: true }));
  it('does not change its input', () => {
    const current = { bexio: false };
    withIntegration(current, current, 'bexio', true);
    expect(current).toEqual({ bexio: false });
  });
});

describe('processorNames', () => {
  it('lists names, and the key when there is none', () => {
    expect(processorNames([{ name: 'Treuhand', key: 't' }, { key: 'k' }, {}, null])).toEqual(['Treuhand', 'k']);
    expect(processorNames(undefined)).toEqual([]);
  });
});
