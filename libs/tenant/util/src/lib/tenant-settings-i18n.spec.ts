import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AvailableLanguages, AvatarUsage, DeliveryChannel, NameDisplay, PersonSortCriteria } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { SETTINGS_AUDIENCES, SETTINGS_GROUPS } from './tenant-settings';
import {
  SETTINGS_GROUP_IDS, SETTINGS_I18N_KEYS, SETTINGS_LOCALES, settingsAudienceKey, settingsFieldKey, settingsGroupKey,
  settingsHelperKey, settingsLocaleKey,
} from './tenant-settings-i18n';

const LANGS = ['de', 'en', 'fr', 'es', 'it'];
const LIBS = join(__dirname, '..', '..', '..', '..');
type Bundle = Record<string, unknown>;

/** The bundle of a scope in one language: '@tenant/util.x' → libs/tenant/util/src/i18n/<lang>.json. */
function bundle(scope: string, lang: string): Bundle {
  return JSON.parse(readFileSync(join(LIBS, scope, 'src', 'i18n', `${lang}.json`), 'utf8')) as Bundle;
}

function lookup(key: string, lang: string): unknown {
  const [scope, ...path] = key.slice(1).split('.');
  return path.reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Bundle)[part] : undefined), bundle(scope, lang));
}

function leaves(node: unknown): string[] {
  return typeof node === 'string' ? [node] : Object.values(node as Bundle).flatMap(leaves);
}

describe('SETTINGS_I18N_KEYS', () => {
  it('has a title per group, and a label and a helper per field', () => {
    for (const group of SETTINGS_GROUP_IDS) {
      expect(SETTINGS_I18N_KEYS).toHaveProperty(settingsGroupKey(group));
      for (const field of SETTINGS_GROUPS[group]) {
        expect(SETTINGS_I18N_KEYS).toHaveProperty(settingsFieldKey(field));
        expect(SETTINGS_I18N_KEYS).toHaveProperty(settingsHelperKey(field));
      }
    }
  });

  it('has a label per audience, locale, language and enum value', () => {
    for (const audience of SETTINGS_AUDIENCES) expect(SETTINGS_I18N_KEYS).toHaveProperty(settingsAudienceKey(audience));
    // toHaveProperty would read 'de-ch' fine, but not a name with a dot: there is none
    for (const locale of SETTINGS_LOCALES) expect(Object.keys(SETTINGS_I18N_KEYS)).toContain(settingsLocaleKey(locale));
    for (const lang of AvailableLanguages) expect(SETTINGS_I18N_KEYS).toHaveProperty(`language_${lang}`);
    for (const id of [AvatarUsage.None, AvatarUsage.GravatarFirst, AvatarUsage.NoGravatar, AvatarUsage.PhotoFirst]) {
      expect(SETTINGS_I18N_KEYS).toHaveProperty(`avatarUsage_${id}`);
    }
    for (const id of [NameDisplay.FirstLast, NameDisplay.LastFirst, NameDisplay.FirstOnly, NameDisplay.LastOnly]) {
      expect(SETTINGS_I18N_KEYS).toHaveProperty(`nameDisplay_${id}`);
    }
    for (const id of [PersonSortCriteria.Firstname, PersonSortCriteria.Lastname, PersonSortCriteria.Fullname, PersonSortCriteria.DateOfBirth, PersonSortCriteria.Key]) {
      expect(SETTINGS_I18N_KEYS).toHaveProperty(`personSortCriteria_${id}`);
    }
    for (const channel of Object.values(DeliveryChannel)) expect(SETTINGS_I18N_KEYS).toHaveProperty(`channel_${channel}`);
  });

  it.each(LANGS)('has a non-empty text for every key in %s', (lang) => {
    for (const [name, key] of Object.entries(SETTINGS_I18N_KEYS)) {
      const text = lookup(key, lang);
      expect(typeof text, `${lang}: ${name}`).toBe('string');
      expect((text as string).trim().length, `${lang}: ${name}`).toBeGreaterThan(0);
    }
  });

  it.each(LANGS)('has no exclamation mark, no placeholder and no club in %s', (lang) => {
    for (const text of leaves((bundle('tenant/util', lang))['settings'])) {
      expect(text).not.toMatch(/[!{}]|Verein/);
    }
  });

  it.each(LANGS)('has a text for every validation message of the suites in %s', (lang) => {
    const source = readFileSync(join(__dirname, 'tenant-settings.validations.ts'), 'utf8');
    const keys = [...source.matchAll(/'(@tenant\/util\.settings\.validation\.\w+)'/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(9);
    for (const key of keys) expect(typeof lookup(key, lang), `${lang}: ${key}`).toBe('string');
  });
});
