import { describe, expect, it } from 'vitest';

import { EnergyFiguresModel, EnergyMonth, EnergyTariff } from '@okr/shared-models';
import { LOCATION_BFS_STATUS_NONE } from '@okr/shared-util-core';

import {
  compareRow, currentTariff, distinctPeriods, ENERGY_REPORTER_URL, energySectionState, formatCompareTariff, formatCount, formatDecimal,
  formatShare, formatTariffRange, isStale, latestValue, operatorNames, solarDocumentUrl, uniqueCompareKeys
} from './energy-figures.util';

function loc(p: { bfsNr?: string; bfsStatus?: string }) {
  const properties = [];
  if (p.bfsNr !== undefined) properties.push({ key: 'bfsNr', value: p.bfsNr });
  if (p.bfsStatus !== undefined) properties.push({ key: 'bfsStatus', value: p.bfsStatus });
  return { properties };
}

function m(date: string, over: Partial<EnergyMonth> = {}): EnergyMonth {
  return {
    date, electricCarCount: null, electricCarShare: null, chargingSpotCount: null, solarKwp: null,
    solarPotentialUsage: null, renewableHeatingShare: null, renewableHeatingCount: null,
    nonRenewableHeatingCount: null, elecPeriodFrom: null, elecPeriodUntil: null, productionPeriodFrom: null,
    productionPeriodUntil: null, elecConsumptionMwh: null, elecConsumptionHouseholdsMwh: null,
    elecPerCapitaMwh: null, renewableProductionMwh: null, solarProductionMwh: null, hydroProductionMwh: null,
    windProductionMwh: null, biomassProductionMwh: null, wasteProductionMwh: null, ...over
  };
}

function tariff(year: number, operatorName: string, total: number): EnergyTariff {
  return { year, operatorName, total, energy: total / 2, gridUsage: total / 4, charge: total / 8, aidFee: total / 8 };
}

function figures(months: EnergyMonth[] = [], tariffs: EnergyTariff[] = []): EnergyFiguresModel {
  const f = new EnergyFiguresModel('scs');
  f.okey = '158';
  f.bfsNr = 158;
  f.months = months;
  f.tariffs = tariffs;
  return f;
}

describe('energySectionState', () => {
  it('has no location', () => expect(energySectionState(undefined, undefined)).toBe('noLocation'));
  it('prepares while there is no status and no document', () => {
    expect(energySectionState(loc({ bfsNr: '158' }), undefined)).toBe('preparing');
    expect(energySectionState(loc({}), undefined)).toBe('preparing');
  });
  it('knows a location without data', () => {
    expect(energySectionState(loc({ bfsStatus: LOCATION_BFS_STATUS_NONE }), undefined)).toBe('noData');
    expect(energySectionState(loc({ bfsNr: '999', bfsStatus: '999' }), undefined)).toBe('noData');
  });
  it('ignores a status written for another number', () => {
    expect(energySectionState(loc({ bfsNr: '998', bfsStatus: '999' }), undefined)).toBe('preparing');
  });
  it('is ready as soon as figures exist, whatever the status says', () => {
    expect(energySectionState(loc({ bfsNr: '158' }), figures())).toBe('ready');
    expect(energySectionState(loc({ bfsNr: '158', bfsStatus: 'none' }), figures())).toBe('ready');
  });
});

describe('latestValue', () => {
  it('carries the date of its own value', () => {
    const months = [m('20230531', { elecConsumptionMwh: 70000 }), m('20230630', { elecConsumptionMwh: null })];
    expect(latestValue(months, 'elecConsumptionMwh')).toEqual({ value: 70000, date: '20230531' });
  });
  it('is undefined without any value', () => {
    expect(latestValue([m('20210331', { elecConsumptionMwh: null })], 'elecConsumptionMwh')).toBeUndefined();
    expect(latestValue([], 'solarKwp')).toBeUndefined();
  });
  it('treats zero as a value', () => {
    expect(latestValue([m('20260131', { hydroProductionMwh: 0 })], 'hydroProductionMwh'))
      .toEqual({ value: 0, date: '20260131' });
  });
});

describe('currentTariff', () => {
  it('gives one operator as a flat range', () => {
    const t = [tariff(2026, 'A', 27.38), tariff(2027, 'A', 25.6)];
    expect(currentTariff(t, 2026)).toEqual({ year: 2026, min: 27.38, max: 27.38, isFallback: false });
  });
  it('gives several operators as a range', () => {
    expect(currentTariff([tariff(2026, 'A', 24.1), tariff(2026, 'B', 27.3)], 2026)).toMatchObject({ min: 24.1, max: 27.3 });
  });
  it('falls back to the newest earlier year, marked as such', () => {
    expect(currentTariff([tariff(2026, 'A', 27.38)], 2028)).toEqual({ year: 2026, min: 27.38, max: 27.38, isFallback: true });
    expect(currentTariff([tariff(2024, 'A', 20), tariff(2026, 'A', 27.38)], 2028)).toMatchObject({ year: 2026, isFallback: true });
  });
  it('never gives a future year', () => {
    expect(currentTariff([tariff(2027, 'A', 25.6)], 2026)).toBeUndefined();
    expect(currentTariff([], 2026)).toBeUndefined();
  });
});

describe('operatorNames', () => {
  it('lists the operators of the newest year, sorted and distinct', () => {
    const t = [tariff(2020, 'Old AG', 20), tariff(2026, 'B AG', 27), tariff(2026, 'A AG', 25), tariff(2026, 'A AG', 25)];
    expect(operatorNames(t)).toEqual(['A AG', 'B AG']);
  });
  it('is empty without tariffs', () => expect(operatorNames([])).toEqual([]));
});

describe('distinctPeriods', () => {
  it('keeps one row per period end, oldest first', () => {
    expect(distinctPeriods([
      m('a', { elecPeriodUntil: '20260731' }), m('b', { elecPeriodUntil: '20260731' }),
      m('c', { elecPeriodUntil: '20260430' }), m('d', { elecPeriodUntil: null })
    ], 'elecPeriodUntil').map((x) => x.elecPeriodUntil)).toEqual(['20260430', '20260731']);
  });
});

describe('isStale', () => {
  it('is stale after 45 days', () => expect(isStale('20260920', new Date('2026-11-04'))).toBe(true));
  it('is fresh within 45 days', () => expect(isStale('20261031', new Date('2026-11-04'))).toBe(false));
  it('respects another limit', () => expect(isStale('20261031', new Date('2026-11-04'), 3)).toBe(true));
  it('is not stale without a date', () => expect(isStale('', new Date('2026-11-04'))).toBe(false));
});

describe('solarDocumentUrl', () => {
  it('derives the BFE document', () => {
    expect(solarDocumentUrl(158)).toBe('https://www.uvek-gis.admin.ch/BFE/storymaps/ECH_SolarpotGemeinden/pdf/158.pdf');
  });
});

describe('uniqueCompareKeys', () => {
  it('drops the main location and duplicates and caps at four', () => {
    expect(uniqueCompareKeys('a', ['a', 'b', 'b', 'c', 'd', 'e', 'f'])).toEqual(['b', 'c', 'd', 'e']);
  });
  it('keeps order', () => expect(uniqueCompareKeys('x', ['c', 'b'])).toEqual(['c', 'b']));
});

describe('compareRow', () => {
  it('still gives a row for a location without data', () => {
    expect(compareRow('Meilen', undefined, 2026)).toMatchObject({ name: 'Meilen', solarPotentialUsage: undefined, tariff: undefined });
  });
  it('picks the latest relative figures', () => {
    const row = compareRow('Stäfa', figures(
      [m('20260131', { solarPotentialUsage: 12, elecPerCapitaMwh: 5 }), m('20260228', { solarPotentialUsage: 13 })],
      [tariff(2026, 'A', 27.38)]
    ), 2026);
    expect(row).toMatchObject({ name: 'Stäfa', bfsNr: 158, solarPotentialUsage: 13, elecPerCapitaMwh: 5 });
    expect(row.tariff).toMatchObject({ min: 27.38, isFallback: false });
  });
});

describe('ENERGY_REPORTER_URL', () => {
  it('is the Energie Reporter site the licence requires a link to', () => {
    expect(ENERGY_REPORTER_URL).toBe('https://www.energiereporter.ch');
  });
});

describe('formatShare', () => {
  it('shows a fraction as percent with one decimal', () => {
    expect(formatShare(0.077988)).toBe('7.8 %');
    expect(formatShare(0.30811)).toBe('30.8 %');
  });
  it('shows zero as a value', () => {
    expect(formatShare(0)).toBe('0.0 %');
  });
  it('gives undefined for a missing value, never 0 or a dash', () => {
    expect(formatShare(undefined)).toBeUndefined();
    expect(formatShare(null)).toBeUndefined();
    expect(formatShare(Number.NaN)).toBeUndefined();
  });
});

describe('formatTariffRange', () => {
  it('shows min and max with an en dash', () => {
    expect(formatTariffRange({ year: 2026, min: 24.1, max: 27.3, isFallback: false })).toBe('24.1\u201327.3');
  });
  it('shows one value when min equals max', () => {
    expect(formatTariffRange({ year: 2026, min: 24.1, max: 24.1, isFallback: false })).toBe('24.1');
  });
  it('gives undefined without a tariff', () => {
    expect(formatTariffRange(undefined)).toBeUndefined();
  });
});

describe('formatDecimal', () => {
  it('shows one decimal and keeps zero', () => {
    expect(formatDecimal(2.43)).toBe('2.4');
    expect(formatDecimal(0)).toBe('0.0');
  });
  it('gives undefined for a missing value', () => {
    expect(formatDecimal(undefined)).toBeUndefined();
    expect(formatDecimal(null)).toBeUndefined();
  });
});

describe('formatCount', () => {
  it('groups thousands and drops decimals', () => expect(formatCount(72527.4)).toBe(new Intl.NumberFormat('de-CH').format(72527)));
  it('keeps zero and rejects what is not a number', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBeUndefined();
    expect(formatCount(Number.NaN)).toBeUndefined();
  });
});

describe('formatCompareTariff', () => {
  it('shows the plain range for the current year', () => {
    expect(formatCompareTariff({ year: 2026, min: 24.1, max: 27.3, isFallback: false })).toBe('24.1\u201327.3');
  });
  it('names the year of a fallback tariff', () => {
    expect(formatCompareTariff({ year: 2025, min: 27, max: 27, isFallback: true })).toBe('27.0 (2025)');
  });
  it('has nothing to show without a tariff', () => expect(formatCompareTariff(undefined)).toBeUndefined());
});
