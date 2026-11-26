import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AppConfig, DEFAULT_DELIVERY_CHANNELS } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { SETTINGS_I18N_KEYS } from './tenant-settings-i18n';
import { OPERATOR_FORM_GROUPS, OPERATOR_SETTINGS, SETTINGS_DEFAULT_NUMBERS, SETTINGS_GROUPS, TENANT_FORM_GROUPS, settingsDiff, settingsOf, type SettingsGroupId } from './tenant-settings';

const NOT_OFFERED = [
  'osiLogoUrl', 'minYear', 'maxYear', 'showImages', 'showArchivedData', 'showName', 'showMemberships',
  'showOwnerships', 'showComments', 'showDocuments', 'showNotes',
];
const OWN_EDITOR = ['enabledFeatures', 'hiddenMenuKeys', 'modelFields', 'hiddenWidgets'];
const GROUPS = Object.keys(SETTINGS_GROUPS) as SettingsGroupId[];

function configWith(patch: Record<string, unknown>): AppConfig {
  return Object.assign(new AppConfig('t1'), patch);
}

describe('SETTINGS_GROUPS', () => {
  it('names only properties of an AppConfig', () => {
    const config = new AppConfig('x');
    for (const group of GROUPS) {
      for (const field of SETTINGS_GROUPS[group]) expect(field in config, `${group}.${String(field)}`).toBe(true);
    }
  });

  it('puts no field into two groups', () => {
    const all = GROUPS.flatMap((g) => SETTINGS_GROUPS[g] as string[]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('leaves out the server-only, separately edited and not offered fields', () => {
    const all = GROUPS.flatMap((g) => SETTINGS_GROUPS[g] as string[]);
    for (const field of [...OWN_EDITOR, ...NOT_OFFERED]) expect(all).not.toContain(field);
  });

  it('has the 19 platform fields', () => {
    expect(OPERATOR_SETTINGS).toBe(SETTINGS_GROUPS.platform);
    expect(OPERATOR_SETTINGS).toHaveLength(19);
  });

  it('equals the operator list of firestore.rules', () => {
    const rules = readFileSync(resolve(__dirname, '../../../../../firestore.rules'), 'utf8');
    // the rule has two hasAny lists: ['enabledFeatures'] (nobody) and the operator-only one — the longer
    const lists = [...rules.matchAll(/appConfigChanged\(\)\.hasAny\(\[([^\]]*)\]\)/g)].map((m) => m[1]);
    const operator = [...lists].sort((a, b) => b.length - a.length)[0];
    expect(operator).toBeDefined();
    const inRules = [...operator.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect([...inRules].sort()).toEqual([...OPERATOR_SETTINGS].map(String).sort());
  });
});

describe('settingsOf', () => {
  it('returns a defined value for every field of every group, for a document that lacks them all', () => {
    const bare = {} as AppConfig;
    for (const group of GROUPS) {
      const out = settingsOf(bare, group) as Record<string, unknown>;
      for (const field of SETTINGS_GROUPS[group]) expect(out[field as string], `${group}.${String(field)}`).not.toBeUndefined();
    }
  });

  it('turns the old numeric delivery enum into the class default', () => {
    const out = settingsOf(configWith({ newsDelivery: 2, invoiceDelivery: 'post' }), 'defaults');
    expect(out.newsDelivery).toEqual(DEFAULT_DELIVERY_CHANNELS);
    expect(out.invoiceDelivery).toEqual(DEFAULT_DELIVERY_CHANNELS);
  });

  it('keeps a stored list of known channels, as a copy', () => {
    const config = configWith({ newsDelivery: ['post'] });
    const out = settingsOf(config, 'defaults');
    expect(out.newsDelivery).toEqual(['post']);
    expect(out.newsDelivery).not.toBe(config.newsDelivery);
  });

  it('reads a null text as empty and a wrong type as the class default', () => {
    const out = settingsOf(configWith({ appTitle: null, appSubtitle: 5, brandColor: null }), 'app');
    expect(out.appTitle).toBe('');
    expect(out.brandColor).toBe('');
    expect(out.appSubtitle).toBe(new AppConfig('x').appSubtitle);
  });

  it('reads listedInPortal into the platform card, false on a legacy doc', () => {
    const legacy = configWith({});
    delete (legacy as unknown as Record<string, unknown>)['listedInPortal'];
    expect(settingsOf(legacy, 'platform')).toMatchObject({ listedInPortal: false });
    expect(settingsOf(configWith({ listedInPortal: true }), 'platform')).toMatchObject({ listedInPortal: true });
    expect(settingsOf(configWith({ listedInPortal: 'yes' }), 'platform')).toMatchObject({ listedInPortal: false });
  });

  it('replaces a wrong type for a boolean, a number, a list and an unknown audience by the default', () => {
    expect(settingsOf(configWith({ showDebugInfo: 'yes', weatherIntervalHours: 'x', additionalProcessors: 3 }), 'platform')).toMatchObject({
      showDebugInfo: false, weatherIntervalHours: 4, additionalProcessors: [],
    });
    expect(settingsOf(configWith({ showEmail: 'everyone', showPhone: null, showIban: 'admin' }), 'privacy')).toMatchObject({
      showEmail: 'registered', showPhone: 'registered', showIban: 'admin',
    });
    expect(settingsOf(configWith({ enabledLanguages: 'de', avatarUsage: null }), 'language').enabledLanguages).toEqual(['de', 'en', 'fr', 'es', 'it']);
  });

  it('never takes a tenant-derived default from another tenant: a missing path is empty', () => {
    const out = settingsOf({} as AppConfig, 'images');
    expect(out.welcomeBannerUrl).toBe('');
    expect(out.notfoundBannerUrl).toBe('');
    expect(settingsOf({} as AppConfig, 'defaults')).toMatchObject({ ownerLocationId: '', defaultResourceId: '' });
  });

  it('deep-copies the integrations map', () => {
    const config = configWith({ integrations: { bexio: true } });
    const out = settingsOf(config, 'platform');
    expect(out.integrations).toEqual({ bexio: true });
    expect(out.integrations).not.toBe(config.integrations);
  });
});

describe('settingsDiff', () => {
  it('is empty when nothing changed', () => {
    const before = settingsOf(configWith({}), 'defaults');
    expect(settingsDiff(before, structuredClone(before))).toEqual({});
  });

  it('compares lists by value', () => {
    expect(settingsDiff({ enabledLanguages: ['de', 'en'] }, { enabledLanguages: ['de', 'en'] })).toEqual({});
    expect(settingsDiff({ enabledLanguages: ['de', 'en'] }, { enabledLanguages: ['de'] })).toEqual({ enabledLanguages: ['de'] });
  });

  it('writes an emptied text as an empty string', () => {
    expect(settingsDiff({ appTitle: 'Titel' }, { appTitle: '' })).toEqual({ appTitle: '' });
  });

  it('returns only keys of a settings group', () => {
    const after = { appName: 'B', enabledFeatures: ['x'], minYear: 1, hiddenMenuKeys: ['y'] } as Record<string, unknown>;
    expect(settingsDiff({ appName: 'A' }, after)).toEqual({ appName: 'B' });
  });

  it('ignores a key the new value does not carry', () => {
    expect(settingsDiff({ appName: 'A', appTitle: 'T' }, { appName: 'A' })).toEqual({});
  });
});

describe('SETTINGS_DEFAULT_NUMBERS', () => {
  it('offers the values of the enums, «no name at all» never', () => {
    expect(SETTINGS_DEFAULT_NUMBERS.avatarUsage).toEqual([0, 1, 2, 3]);
    expect(SETTINGS_DEFAULT_NUMBERS.nameDisplay).toEqual([0, 1, 2, 3]);
    expect(SETTINGS_DEFAULT_NUMBERS.personSortCriteria).toEqual([0, 1, 2, 3, 4]);
  });

  it('has a label for every offered number', () => {
    for (const [field, numbers] of Object.entries(SETTINGS_DEFAULT_NUMBERS)) {
      for (const n of numbers) expect(SETTINGS_I18N_KEYS[`${field}_${n}`], `${field}_${n}`).toBeTruthy();
    }
  });
});

describe('form groups', () => {
  it('the tenant page never offers the platform group, the operator page nothing else', () => {
    expect(TENANT_FORM_GROUPS).not.toContain('platform');
    expect(OPERATOR_FORM_GROUPS).toEqual(['platform']);
    expect([...TENANT_FORM_GROUPS, ...OPERATOR_FORM_GROUPS].sort()).toEqual(Object.keys(SETTINGS_GROUPS).sort());
  });
});
