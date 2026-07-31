import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { MoneyModel, OwnershipModel } from '@okr/shared-models';
import { buildExportTable } from '@okr/shared-util-core';

import { OWNERSHIP_I18N_KEYS, OwnershipI18n } from './ownership-i18n';
import { getOwnershipExportColumns, getOwnershipExportFileName, OwnershipExportResolvers, resolveResourceSubType } from './ownership-export';

/** Every label resolves to its own key name, so a header assertion reads like the key. */
const i18n = Object.fromEntries(
  Object.keys(OWNERSHIP_I18N_KEYS).map((key) => [key, signal(key)])
) as unknown as OwnershipI18n;

/** Resolvers that mark which category was consulted, so a mix-up is visible in the cell. */
const resolve: OwnershipExportResolvers = {
  resourceType: (v) => (v ? `type:${v}` : ''),
  rboatType:    (v) => (v ? `rboat:${v}` : ''),
  gender:       (v) => (v ? `gender:${v}` : ''),
  type:         (v) => (v ? `ocat:${v}` : ''),
  state:        (v) => (v ? `state:${v}` : ''),
};

function newOwnership(overrides: Partial<OwnershipModel> = {}): OwnershipModel {
  return Object.assign(new OwnershipModel('scs'), overrides);
}

function cell(ownership: OwnershipModel, listId: string, header: string): string {
  const table = buildExportTable([ownership], getOwnershipExportColumns(listId, i18n, resolve));
  return table[1][table[0].indexOf(header)];
}

describe('ownership-export', () => {
  describe('getOwnershipExportColumns', () => {
    it('should omit the owner columns for club boats — the owner is always the club', () => {
      const headers = getOwnershipExportColumns('scsBoats', i18n, resolve).map((c) => c.header);
      expect(headers).not.toContain('export_ownerName1');
      expect(headers).not.toContain('export_ownerName2');
      expect(headers.slice(0, 2)).toEqual(['export_boatName', 'export_boatType']);
    });

    it('should keep the owner columns for private boats', () => {
      const headers = getOwnershipExportColumns('privateBoats', i18n, resolve).map((c) => c.header);
      expect(headers.slice(0, 2)).toEqual(['export_ownerName1', 'export_ownerName2']);
      expect(headers).toContain('export_boatType');
    });

    it('should label the resource column per list', () => {
      expect(getOwnershipExportColumns('lockers', i18n, resolve).map((c) => c.header)).toContain('export_lockerNr');
      expect(getOwnershipExportColumns('keys', i18n, resolve).map((c) => c.header)).toContain('export_keyNr');
      expect(getOwnershipExportColumns('all', i18n, resolve).map((c) => c.header)).toContain('export_resourceName');
    });

    it('should resolve the boat type for a private boat', () => {
      const boat = newOwnership({ resourceType: 'rboat', resourceSubType: 'b1x', resourceName: 'Sirius' });
      expect(cell(boat, 'privateBoats', 'export_boatType')).toBe('rboat:b1x');
    });

    it('should resolve the gender of a locker, not the boat type', () => {
      const locker = newOwnership({ resourceType: 'locker', resourceSubType: 'female', resourceName: '12' });
      expect(cell(locker, 'lockers', 'export_gender')).toBe('gender:female');
    });

    it('should format the validity period and blank the open end', () => {
      const key = newOwnership({ validFrom: '20240512', validTo: '99991231' });
      expect(cell(key, 'keys', 'export_validFrom')).toBe('12.05.2024');
      expect(cell(key, 'keys', 'export_validTo')).toBe('');
    });

    it('should export the legacy numeric price with its sibling currency', () => {
      const legacy = newOwnership({ ...({ price: 50, currency: 'CHF' } as unknown as Partial<OwnershipModel>) });
      expect(cell(legacy, 'keys', 'export_price')).toBe('50');
      expect(cell(legacy, 'keys', 'export_currency')).toBe('CHF');
    });

    it('should export a MoneyModel price', () => {
      const priced = newOwnership({ price: new MoneyModel(20000, 'EUR') });
      expect(cell(priced, 'keys', 'export_price')).toBe('20000');
      expect(cell(priced, 'keys', 'export_currency')).toBe('EUR');
    });

    it('should resolve type and state on every list', () => {
      const ownership = newOwnership({ type: 'use', state: 'active' });
      for (const listId of ['all', 'ownerships', 'scsBoats', 'privateBoats', 'lockers', 'keys']) {
        expect(cell(ownership, listId, 'export_type')).toBe('ocat:use');
        expect(cell(ownership, listId, 'export_state')).toBe('state:active');
      }
    });

    it('should append the technical keys to every owner-bearing list', () => {
      for (const listId of ['all', 'privateBoats', 'lockers', 'keys']) {
        const headers = getOwnershipExportColumns(listId, i18n, resolve).map((c) => c.header);
        expect(headers.slice(-3)).toEqual(['export_okey', 'export_ownerKey', 'export_resourceKey']);
      }
    });

    it('should fall back to the full column set for an unknown list id', () => {
      const headers = getOwnershipExportColumns('nonsense', i18n, resolve).map((c) => c.header);
      expect(headers).toEqual(getOwnershipExportColumns('all', i18n, resolve).map((c) => c.header));
    });

    it('should never leave a row shorter than the header row', () => {
      const table = buildExportTable([newOwnership()], getOwnershipExportColumns('all', i18n, resolve));
      expect(table[1].length).toBe(table[0].length);
    });
  });

  describe('resolveResourceSubType', () => {
    it('should pick the category that matches the resource type', () => {
      expect(resolveResourceSubType(newOwnership({ resourceType: 'rboat', resourceSubType: 'b8p' }), resolve)).toBe('rboat:b8p');
      expect(resolveResourceSubType(newOwnership({ resourceType: 'locker', resourceSubType: 'male' }), resolve)).toBe('gender:male');
      expect(resolveResourceSubType(newOwnership({ resourceType: 'key', resourceSubType: '' }), resolve)).toBe('');
    });
  });

  describe('getOwnershipExportFileName', () => {
    it('should return a distinct stem per list', () => {
      const stems = ['scsBoats', 'privateBoats', 'lockers', 'keys'].map(getOwnershipExportFileName);
      expect(stems).toEqual(['clubboote', 'privatboote', 'garderoben', 'schluessel']);
      expect(getOwnershipExportFileName('all')).toBe('eigentum');
    });
  });
});
