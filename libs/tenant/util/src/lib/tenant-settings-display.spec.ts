import { AppConfig, AvatarUsage, DeliveryChannel, FOOTPRINT_PAGE_TYPE, PageModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { settingsOf } from './tenant-settings';
import {
  settingsDisplayValue, settingsPageName, settingsPageOptions, settingsRows, withStored, type SettingsDisplayContext,
} from './tenant-settings-display';
import { SETTINGS_GROUP_IDS, SETTINGS_I18N_KEYS } from './tenant-settings-i18n';

const CTX: SettingsDisplayContext = {
  text: (name) => (name in SETTINGS_I18N_KEYS ? `t:${name}` : ''),
  countryName: (code) => (code === 'CH' ? 'Schweiz' : ''),
  pageName: (key) => (key === 'privacy' ? 'Datenschutz' : ''),
  locationName: (key) => (key === 'loc' ? 'Hafen' : ''),
  resourceName: () => '',
  orgName: () => '',
};

function page(okey: string, name: string, patch: Partial<PageModel> = {}): PageModel {
  return Object.assign(new PageModel('scs'), { okey, name, ...patch });
}

describe('settingsDisplayValue', () => {
  it('shows nothing for a value that is not set', () => {
    for (const value of [undefined, null, '', '  ', [], {}]) expect(settingsDisplayValue('appTitle', value, CTX)).toBe('');
  });
  it('labels audiences, locales, languages, channels, enum numbers and switches', () => {
    expect(settingsDisplayValue('showEmail', 'registered', CTX)).toBe('t:audience_registered');
    expect(settingsDisplayValue('locale', 'de-ch', CTX)).toBe('t:locale_de-ch');
    expect(settingsDisplayValue('enabledLanguages', ['de', 'it'], CTX)).toBe('t:language_de, t:language_it');
    expect(settingsDisplayValue('newsDelivery', [DeliveryChannel.Email, DeliveryChannel.Chat], CTX)).toBe('t:channel_email, t:channel_chat');
    expect(settingsDisplayValue('avatarUsage', AvatarUsage.None, CTX)).toBe('t:avatarUsage_0');
    expect(settingsDisplayValue('personLookupEnabled', false, CTX)).toBe('t:no');
    expect(settingsDisplayValue('showDebugInfo', true, CTX)).toBe('t:yes');
  });
  it('names countries, pages and places, and keeps an unknown key as it is', () => {
    expect(settingsDisplayValue('opCountryCode', 'CH', CTX)).toBe('Schweiz');
    expect(settingsDisplayValue('opCountryCode', 'Schweiz', CTX)).toBe('Schweiz');
    expect(settingsDisplayValue('privacyPolicyPageKey', 'privacy', CTX)).toBe('Datenschutz');
    expect(settingsDisplayValue('privacyPolicyPageKey', 'gone', CTX)).toBe('gone');
    expect(settingsDisplayValue('ownerLocationId', 'loc', CTX)).toBe('Hafen');
    expect(settingsDisplayValue('defaultResourceId', 'r1', CTX)).toBe('r1');
    expect(settingsDisplayValue('locale', 'rm', CTX)).toBe('rm');
    expect(settingsDisplayValue('showEmail', 'nobody', CTX)).toBe('nobody');
  });
  it('lists integrations that are on and additional processors by name', () => {
    expect(settingsDisplayValue('integrations', { bexio: true, deepsign: false, matrix: true }, CTX)).toBe('bexio, matrix');
    expect(settingsDisplayValue('additionalProcessors', [{ name: 'Treuhand' }, {}], CTX)).toBe('Treuhand');
  });
  it('shows a plain number', () => expect(settingsDisplayValue('weatherIntervalHours', 4, CTX)).toBe('4'));
});

describe('settingsRows', () => {
  it('has a labelled line per field and never a broken value, for every group', () => {
    for (const group of SETTINGS_GROUP_IDS) {
      for (const config of [new AppConfig('scs'), {} as AppConfig]) {
        for (const row of settingsRows(group, settingsOf(config, group), CTX)) {
          expect(row.label).toBe(`t:field_${row.field}`);
          expect(row.value, row.field).not.toMatch(/undefined|null|object Object|NaN/);
        }
      }
    }
  });
  it('carries the colour of a valid brand colour only', () => {
    const color = (brandColor: string) => settingsRows('app', { brandColor }, CTX).find((r) => r.field === 'brandColor')?.color;
    expect(color('#12abEF')).toBe('#12abEF');
    expect(color('red')).toBe('');
    expect(color('')).toBe('');
  });
});

describe('settings pages', () => {
  const pages = [
    page('privacy', 'Datenschutz (gemeinsam)'), page('privacy_scs', 'Datenschutz'), page('about', 'Über uns'),
    page('f1', 'Reise', { type: FOOTPRINT_PAGE_TYPE }), page('untitled', '', { title: 'Titel' }),
  ];
  it('offers pages by name, without footprints and without the shared page behind an own copy', () => {
    expect(settingsPageOptions(pages, 'scs', '')).toEqual([
      { key: 'privacy_scs', label: 'Datenschutz' }, { key: 'untitled', label: 'Titel' }, { key: 'about', label: 'Über uns' },
    ]);
  });
  it('keeps the stored key first, under the name of the page it opens', () => {
    expect(settingsPageOptions(pages, 'scs', 'privacy')[0]).toEqual({ key: 'privacy', label: 'Datenschutz' });
    expect(settingsPageOptions(pages, 'scs', 'about').map((o) => o.key)).toEqual(['about', 'privacy_scs', 'untitled']);
    expect(settingsPageOptions([], 'scs', 'gone')).toEqual([{ key: 'gone', label: 'gone' }]);
  });
  it('knows no page for an empty or unknown key', () => {
    expect(settingsPageName('', pages, 'scs')).toBe('');
    expect(settingsPageName('gone', pages, 'scs')).toBe('');
  });
});

describe('withStored', () => {
  it('adds an unknown stored value first and changes nothing else', () => {
    expect(withStored(['a', 'b'], 'x')).toEqual(['x', 'a', 'b']);
    expect(withStored(['a', 'b'], 'b')).toEqual(['a', 'b']);
    expect(withStored(['a'], '')).toEqual(['a']);
    expect(withStored(['a'], undefined)).toEqual(['a']);
  });
});
