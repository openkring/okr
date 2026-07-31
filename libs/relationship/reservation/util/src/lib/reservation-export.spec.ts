import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { AvatarInfo, MoneyModel, ReservationModel } from '@okr/shared-models';
import { buildExportTable } from '@okr/shared-util-core';

import { RESERVATION_I18N_KEYS, ReservationI18n } from './reservation-i18n';
import {
  getReservationExportColumns,
  getReservationExportFileName,
  isReserverFixed,
  isResourceFixed,
  ReservationExportResolvers,
} from './reservation-export';

/** Every label resolves to its own key name, so a header assertion reads like the key. */
const i18n = Object.fromEntries(
  Object.keys(RESERVATION_I18N_KEYS).map((key) => [key, signal(key === 'export_yes' ? 'ja' : key === 'export_no' ? 'nein' : key)])
) as unknown as ReservationI18n;

const resolve: ReservationExportResolvers = {
  state:  (v) => (v ? `state:${v}` : ''),
  reason: (v) => (v ? `reason:${v}` : ''),
};

function avatar(overrides: Partial<AvatarInfo> = {}): AvatarInfo {
  return { key: 'k1', name1: 'Merrill', name2: 'Gutzwiller', modelType: 'person', type: '', subType: '', label: '', ...overrides };
}

function newReservation(overrides: Partial<ReservationModel> = {}): ReservationModel {
  return Object.assign(new ReservationModel('scs'), overrides);
}

function cell(reservation: ReservationModel, listId: string, header: string): string {
  const table = buildExportTable([reservation], getReservationExportColumns(listId, i18n, resolve));
  return table[1][table[0].indexOf(header)];
}

describe('reservation-export', () => {
  describe('getReservationExportColumns', () => {
    it('should export both parties on the unfiltered list', () => {
      const headers = getReservationExportColumns('all', i18n, resolve).map((c) => c.header);
      expect(headers.slice(0, 3)).toEqual(['export_reserver', 'export_resource', 'export_name']);
    });

    it('should drop the resource column when the list pins one resource', () => {
      const headers = getReservationExportColumns('r_scs_default', i18n, resolve).map((c) => c.header);
      expect(headers).not.toContain('export_resource');
      expect(headers[0]).toBe('export_reserver');
    });

    it('should drop the resource column when the list pins a resource type', () => {
      expect(getReservationExportColumns('t_rboat', i18n, resolve).map((c) => c.header)).not.toContain('export_resource');
    });

    it('should drop the reserver column when the list pins one reserver', () => {
      for (const listId of ['my', 'p_abc', 'o_scs']) {
        const headers = getReservationExportColumns(listId, i18n, resolve).map((c) => c.header);
        expect(headers).not.toContain('export_reserver');
        expect(headers[0]).toBe('export_resource');
      }
    });

    it('should render the reserver and resource as full names', () => {
      const reservation = newReservation({
        reserver: avatar(),
        resource: avatar({ key: 'scs_default', name1: '', name2: 'Bootshaus', modelType: 'resource' }),
      });
      expect(cell(reservation, 'all', 'export_reserver')).toContain('Gutzwiller');
      expect(cell(reservation, 'all', 'export_resource')).toContain('Bootshaus');
    });

    it('should resolve state and reason', () => {
      const reservation = newReservation({ state: 'cancelled', reason: 'private' });
      expect(cell(reservation, 'all', 'export_state')).toBe('state:cancelled');
      expect(cell(reservation, 'all', 'export_reason')).toBe('reason:private');
    });

    it('should format dates, times and the full-day flag', () => {
      const reservation = newReservation({ startDate: '20240901', startTime: '0930', endDate: '20240901', fullDay: true });
      expect(cell(reservation, 'all', 'export_startDate')).toBe('01.09.2024');
      expect(cell(reservation, 'all', 'export_startTime')).toBe('09:30');
      expect(cell(reservation, 'all', 'export_fullDay')).toBe('ja');
      expect(cell(newReservation({ fullDay: false }), 'all', 'export_fullDay')).toBe('nein');
    });

    it('should split the price into an amount and a currency column', () => {
      const reservation = newReservation({ price: new MoneyModel(60000, 'CHF') });
      expect(cell(reservation, 'all', 'export_price')).toBe('60000');
      expect(cell(reservation, 'all', 'export_currency')).toBe('CHF');
    });

    it('should leave the price columns empty when there is no price', () => {
      expect(cell(newReservation(), 'all', 'export_price')).toBe('');
      expect(cell(newReservation(), 'all', 'export_currency')).toBe('');
    });

    it('should tolerate a reservation without reserver or resource', () => {
      const table = buildExportTable([newReservation()], getReservationExportColumns('all', i18n, resolve));
      expect(table[1].length).toBe(table[0].length);
      expect(table[1][table[0].indexOf('export_reserverKey')]).toBe('');
    });

    it('should append the technical keys last', () => {
      const headers = getReservationExportColumns('all', i18n, resolve).map((c) => c.header);
      expect(headers.slice(-3)).toEqual(['export_okey', 'export_reserverKey', 'export_resourceKey']);
    });
  });

  describe('isReserverFixed / isResourceFixed', () => {
    it('should classify the list filters', () => {
      expect(isReserverFixed('my')).toBe(true);
      expect(isReserverFixed('p_abc')).toBe(true);
      expect(isReserverFixed('o_scs')).toBe(true);
      expect(isReserverFixed('all')).toBe(false);
      expect(isResourceFixed('r_scs_default')).toBe(true);
      expect(isResourceFixed('t_rboat')).toBe(true);
      expect(isResourceFixed('all')).toBe(false);
    });
  });

  describe('getReservationExportFileName', () => {
    it('should keep the filter in the file name so scoped exports do not collide', () => {
      expect(getReservationExportFileName('all')).toBe('reservationen');
      expect(getReservationExportFileName('')).toBe('reservationen');
      expect(getReservationExportFileName('r_scs_default')).toBe('reservationen-r_scs_default');
    });
  });
});
