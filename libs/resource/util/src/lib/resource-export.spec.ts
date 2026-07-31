import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { ResourceModel } from '@okr/shared-models';
import { buildExportTable } from '@okr/shared-util-core';

import { ResourceI18n, RESOURCE_I18N_KEYS } from './resource-i18n';
import { getResourceExportColumns, getResourceExportFileName, ResourceExportResolvers, resolveSubType } from './resource-export';

/** Every label resolves to its own key name, so a header assertion reads like the key. */
const i18n = Object.fromEntries(
  Object.keys(RESOURCE_I18N_KEYS).map((key) => [key, signal(key)])
) as unknown as ResourceI18n;

/** Resolvers that mark which category was consulted, so a mix-up is visible in the cell. */
const resolve: ResourceExportResolvers = {
  resourceType: (v) => (v ? `type:${v}` : ''),
  rboatType:    (v) => (v ? `rboat:${v}` : ''),
  rboatUsage:   (v) => (v ? `usage:${v}` : ''),
  gender:       (v) => (v ? `gender:${v}` : ''),
};

function newResource(overrides: Partial<ResourceModel> = {}): ResourceModel {
  return Object.assign(new ResourceModel('scs'), overrides);
}

describe('resource-export', () => {
  describe('getResourceExportColumns', () => {
    it('should resolve the boat type and usage of a rowing boat', () => {
      const boat = newResource({ name: 'Sirius', type: 'rboat', subType: 'b2x', usage: 'breitensport', seats: 2 });
      const table = buildExportTable([boat], getResourceExportColumns('rboat', i18n, resolve));
      expect(table[0].slice(0, 4)).toEqual(['export_name', 'export_boatType', 'export_usage', 'export_seats']);
      expect(table[1].slice(0, 4)).toEqual(['Sirius', 'rboat:b2x', 'usage:breitensport', '2']);
    });

    it('should resolve the gender of a locker, not the boat type', () => {
      const locker = newResource({ name: '12', type: 'locker', subType: 'female' });
      const table = buildExportTable([locker], getResourceExportColumns('locker', i18n, resolve));
      expect(table[0]).toEqual(['export_lockerNr', 'export_gender', 'export_description', 'export_tags', 'export_okey']);
      expect(table[1]).toEqual(['12', 'gender:female', '', '', '']);
    });

    it('should export a key list without a subtype column', () => {
      const key = newResource({ name: 'Typ 2 / RF7973', type: 'key', currentValue: 50 });
      const table = buildExportTable([key], getResourceExportColumns('key', i18n, resolve));
      expect(table[0]).toEqual(['export_keyNr', 'export_description', 'export_currentValue', 'export_tags', 'export_okey']);
      expect(table[1][2]).toBe('50');
    });

    it('should resolve the resource type on the mixed resource list', () => {
      const car = newResource({ name: 'Bus', type: 'car', subType: 'bus', brand: 'VW' });
      const table = buildExportTable([car], getResourceExportColumns('resource', i18n, resolve));
      expect(table[0].slice(0, 3)).toEqual(['export_name', 'export_type', 'export_subType']);
      // 'car' has no subType category — the raw code survives rather than being mislabelled.
      expect(table[1].slice(0, 3)).toEqual(['Bus', 'type:car', 'bus']);
    });

    it('should fall back to the mixed resource columns for an unknown list type', () => {
      const columns = getResourceExportColumns('unknown' as never, i18n, resolve);
      expect(columns.map((c) => c.header)).toEqual(getResourceExportColumns('resource', i18n, resolve).map((c) => c.header));
    });

    it('should render unset numeric fields as empty cells', () => {
      const boat = newResource({ name: 'Skiff', type: 'rboat', seats: 0, weight: 0, length: 0 });
      const table = buildExportTable([boat], getResourceExportColumns('rboat', i18n, resolve));
      const headers = table[0];
      expect(table[1][headers.indexOf('export_seats')]).toBe('');
      expect(table[1][headers.indexOf('export_weight')]).toBe('');
      expect(table[1][headers.indexOf('export_length')]).toBe('');
    });

    it('should never leave a row shorter than the header row', () => {
      const table = buildExportTable([newResource()], getResourceExportColumns('resource', i18n, resolve));
      expect(table[1].length).toBe(table[0].length);
    });
  });

  describe('resolveSubType', () => {
    it('should use the rboat_type category for rowing boats', () => {
      expect(resolveSubType(newResource({ type: 'rboat', subType: 'b4x' }), resolve)).toBe('rboat:b4x');
    });

    it('should use the gender category for lockers', () => {
      expect(resolveSubType(newResource({ type: 'locker', subType: 'male' }), resolve)).toBe('gender:male');
    });

    it('should return the raw code for any other resource type', () => {
      expect(resolveSubType(newResource({ type: 'pet', subType: 'cat' }), resolve)).toBe('cat');
    });
  });

  describe('getResourceExportFileName', () => {
    it('should return a distinct stem per list', () => {
      const stems = (['resource', 'rboat', 'locker', 'key'] as const).map(getResourceExportFileName);
      expect(stems).toEqual(['resourcen', 'ruderboote', 'garderoben', 'schluessel']);
      expect(new Set(stems).size).toBe(stems.length);
    });
  });
});
