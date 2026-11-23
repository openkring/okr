import { AppConfig, AvatarUsage, DeliveryChannel, FOOTPRINT_PAGE_TYPE, PageModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { settingsOf } from './tenant-settings';
import {
  settingsDisplayValue, settingsPageName, settingsPageOptions, settingsRows, withLanguage, withStored, type SettingsDisplayContext,
} from './tenant-settings-display';
import { SETTINGS_GROUP_IDS, SETTINGS_I18N_KEYS } from './tenant-settings-i18n';

const CTX: SettingsDisplayContext = {
  text: (name) => (name in SETTINGS_I18N_KEYS ? `t:${name}` : ''),
  countryName: (code) => (code === 'CH' ? 'Schweiz' : ''),
  pageName: (key) => (key === 'privacy' ? 'Datenschutz' : ''),
  locationName: (key) => (key === 'loc' ? 'Hafen' : ''),
  resourceName: () => '',
  startName: (url) => (url === '/diary' ? 'Tagebuch' : ''),
  orgName: () => '',
};

function page(okey: string, name: string, patch: Partial<PageModel> = {}): PageModel {
  return Object.assign(new PageModel('scs'), { okey, name, isPrivate: false, ...patch });
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
    expect(settingsDisplayValue('rootUrl', '/diary', CTX)).toBe('Tagebuch');
    expect(settingsDisplayValue('welcomeBannerUrl', 'tenant/scs/app/welcome.jpg', CTX)).toBe('welcome.jpg');
    expect(settingsDisplayValue('notfoundBannerUrl', '', CTX)).toBe('');
    expect(settingsDisplayValue('rootUrl', '/person/all?filters=search', CTX)).toBe('/person/all?filters=search');
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

describe('settingsRows, empty fields', () => {
  const emptyText = (group: 'app' | 'privacy' | 'mail' | 'start', field: string) => settingsRows(group, {}, CTX).find((r) => r.field === field)?.emptyText;
  it('says default only where another value applies', () => {
    expect(emptyText('app', 'brandColor')).toBe('fallback');
    expect(emptyText('mail', 'mailFrom')).toBe('fallback');
    expect(emptyText('privacy', 'dpoEmail')).toBe('fallback');
    expect(emptyText('start', 'rootUrl')).toBe('fallback');
    expect(emptyText('app', 'appTitle')).toBe('empty');
    expect(emptyText('privacy', 'privacyPolicyPageKey')).toBe('empty');
  });
});

describe('withLanguage', () => {
  it('keeps the stored order and adds at the end', () => {
    expect(withLanguage(['fr', 'en'], 'de', true)).toEqual(['fr', 'en', 'de']);
    expect(withLanguage(['fr', 'en', 'it'], 'en', false)).toEqual(['fr', 'it']);
  });
  it('changes nothing that is already so', () => {
    expect(withLanguage(['fr', 'en'], 'fr', true)).toEqual(['fr', 'en']);
    expect(withLanguage(['fr', 'en'], 'de', false)).toEqual(['fr', 'en']);
  });
  it('can empty the list, and drops and never adds an unknown code', () => {
    expect(withLanguage(['de'], 'de', false)).toEqual([]);
    expect(withLanguage(['xx', 'de'], 'en', true)).toEqual(['de', 'en']);
    expect(withLanguage(['de'], 'xx', true)).toEqual(['de']);
  });
  it('does not change its input', () => {
    const current = ['fr', 'en'];
    withLanguage(current, 'de', true);
    expect(current).toEqual(['fr', 'en']);
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
  it('offers only pages visible without signing in, and keeps the stored one', () => {
    const mixed = [page('a', 'A'), page('b', 'B', { isPrivate: true }), page('c', 'C'), page('c_scs', 'C eigen', { isPrivate: true })];
    expect(settingsPageOptions(mixed, 'scs', '').map((o) => o.key)).toEqual(['a']);
    expect(settingsPageOptions(mixed, 'scs', 'b')).toEqual([{ key: 'b', label: 'B' }, { key: 'a', label: 'A' }]);
  });
  it('keeps the stored key first, under the name of the page it opens', () => {
    // neither the stored shared page nor the tenant's own copy of it is listed a second time
    expect(settingsPageOptions(pages, 'scs', 'privacy').map((o) => o.key)).toEqual(['privacy', 'untitled', 'about']);
    expect(settingsPageOptions(pages, 'scs', 'privacy')[0]).toEqual({ key: 'privacy', label: 'Datenschutz' });
    expect(settingsPageOptions(pages, 'scs', 'privacy_scs').map((o) => o.key)).toEqual(['privacy_scs', 'untitled', 'about']);
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
