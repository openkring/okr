import { describe, expect, it } from 'vitest';

import { EnergyFiguresModel, EnergyMonth, EnergyTariff } from '@okr/shared-models';

import { ENERGY_I18N_KEYS, EnergyI18n, EnergyI18nKey } from './energy-i18n';
import {
  compareTarget, energyCompareRows, energyHeader, energyStaleNote, energyTariffCharts, energyTiles,
  energyTrendCharts, hasFutureTariff, percentPoints
} from './energy-section.util';

const TEXTS: Partial<Record<EnergyI18nKey, string>> = {
  state_stale: 'Die Daten stammen vom {date}.',
  header_bfsNr: 'BFS-Nr. {n}',
  header_asOf: 'Stand {date}',
  header_operators: 'Netzbetreiber',
  tiles_households: 'davon {share} % Haushalte',
  tiles_tariffYear: 'Tarif {year}',
  tiles_tariffFallback: 'Tarif {year}, noch nicht veröffentlicht',
  tiles_periodRange: '{from} bis {until}',
  tiles_asOf: 'Stand {date}',
  tiles_unitMwh: 'MWh',
  tiles_unitKwp: 'kWp',
  tiles_unitRpKwh: 'Rp./kWh',
  tariffs_operator: 'Netzbetreiber: {name}',
  tariffs_unit: 'Rp./kWh'
};

const i18n = Object.fromEntries(
  (Object.keys(ENERGY_I18N_KEYS) as EnergyI18nKey[]).map((key) => [key, () => TEXTS[key] ?? key])
) as EnergyI18n;

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
  const f = new EnergyFiguresModel('elab');
  f.okey = '158';
  f.bfsNr = 158;
  f.municipality = 'Stäfa';
  f.sourceDate = '20261031';
  f.months = months;
  f.tariffs = tariffs;
  return f;
}

/** A document that only ever got one source: Firestore reads skip the model defaults. */
function partial(over: Partial<EnergyFiguresModel>): EnergyFiguresModel {
  return { okey: '158', tenants: ['elab'], isArchived: false, bfsNr: 158, ...over } as EnergyFiguresModel;
}

// The thousands separator of de-CH differs between ICU versions (' or ’), so the expectation asks Intl too.
const count = (value: number) => new Intl.NumberFormat('de-CH').format(value);

const tile = (f: EnergyFiguresModel, key: EnergyI18nKey) => energyTiles(f, i18n, 2026, 'de').find((t) => t.label === key);

describe('percentPoints', () => {
  it('turns a fraction into percent without float noise', () => expect(percentPoints(0.078)).toBe(7.8));
  it('keeps zero', () => expect(percentPoints(0)).toBe(0));
  it('keeps a gap a gap', () => {
    expect(percentPoints(null)).toBeNull();
    expect(percentPoints(undefined)).toBeNull();
  });
});

describe('energyTiles', () => {
  const months = [
    m('20260930', { electricCarCount: 600 }),
    m('20261031', {
      elecConsumptionMwh: 72527, elecConsumptionHouseholdsMwh: 29010.8, elecPeriodFrom: '20250801', elecPeriodUntil: '20260731',
      renewableProductionMwh: 7819, productionPeriodFrom: '20250101', productionPeriodUntil: '20251231', solarKwp: 8592,
      solarPotentialUsage: 0.078, renewableHeatingShare: 0.25, chargingSpotCount: 0
    })
  ];

  it('gives consumption its period and the household share, not the snapshot date', () => {
    const found = tile(figures(months), 'tiles_consumption');
    expect(found?.value).toBe(`${count(72527)} MWh`);
    expect(found?.note).toBe('August 2025 bis Juli 2026 · davon 40.0 % Haushalte');
  });

  it('gives production its own period', () => {
    const found = tile(figures(months), 'tiles_production');
    expect(found?.value).toBe(`${count(7819)} MWh`);
    expect(found?.note).toBe('Januar 2025 bis Dezember 2025');
  });

  it('leaves the household share out when it is unknown', () => {
    const f = figures([m('20261031', { elecConsumptionMwh: 100, elecPeriodFrom: '20250801', elecPeriodUntil: '20260731' })]);
    expect(tile(f, 'tiles_consumption')?.note).toBe('August 2025 bis Juli 2026');
  });

  it('writes the months of the period in the active language', () => {
    const f = figures([m('20261031', { elecConsumptionMwh: 100, elecPeriodFrom: '20250801', elecPeriodUntil: '20260731' })]);
    const found = energyTiles(f, i18n, 2026, 'fr').find((t) => t.label === 'tiles_consumption');
    expect(found?.note).toBe('août 2025 bis juillet 2026');
  });

  it('falls back to the row date when a period is missing', () => {
    const f = figures([m('20261031', { elecConsumptionMwh: 100 })]);
    expect(tile(f, 'tiles_consumption')?.note).toBe('Stand 31.10.2026');
  });

  it('falls back to the row date instead of throwing when a stored period date is malformed', () => {
    const f = figures([m('20261031', { elecConsumptionMwh: 100, elecPeriodFrom: 'garbage', elecPeriodUntil: '20260731' })]);
    expect(() => energyTiles(f, i18n, 2026, 'de')).not.toThrow();
    expect(tile(f, 'tiles_consumption')?.note).toBe('Stand 31.10.2026');
  });

  it('does not show half a period', () => {
    const f = figures([m('20261031', { renewableProductionMwh: 100, productionPeriodUntil: '20251231' })]);
    expect(tile(f, 'tiles_production')?.note).toBe('Stand 31.10.2026');
  });

  it('dates every other tile with its own row', () => {
    expect(tile(figures(months), 'tiles_electricCars')).toEqual({
      label: 'tiles_electricCars', value: '600', note: 'Stand 30.09.2026'
    });
    expect(tile(figures(months), 'tiles_solarCapacity')?.value).toBe(`${count(8592)} kWp`);
    expect(tile(figures(months), 'tiles_solarPotential')?.value).toBe('7.8 %');
    expect(tile(figures(months), 'tiles_renewableHeating')?.value).toBe('25.0 %');
  });

  it('treats zero as a value', () => {
    expect(tile(figures(months), 'tiles_chargingPoints')?.value).toBe('0');
  });

  it('omits a figure that has no value, instead of showing 0', () => {
    const labels = energyTiles(figures([m('20261031', { solarKwp: 10 })]), i18n, 2026, 'de').map((t) => t.label);
    expect(labels).toEqual([i18n.tiles_solarCapacity()]);
  });

  it('shows the range of this calendar year for the current tariff', () => {
    const f = figures([], [tariff(2026, 'A', 24.1), tariff(2026, 'B', 27.3), tariff(2027, 'A', 40)]);
    expect(tile(f, 'tiles_tariff')).toEqual({
      label: 'tiles_tariff', value: '24.1–27.3 Rp./kWh', note: 'Tarif 2026'
    });
  });

  it('names the year of a fallback tariff', () => {
    const f = figures([], [tariff(2025, 'A', 27)]);
    expect(tile(f, 'tiles_tariff')?.note).toBe('Tarif 2025, noch nicht veröffentlicht');
  });

  it('survives a partial document', () => {
    expect(energyTiles(partial({ tariffs: [tariff(2026, 'A', 27)] }), i18n, 2026, 'de').map((t) => t.label)).toEqual(['tiles_tariff']);
    expect(energyTiles(partial({}), i18n, 2026, 'de')).toEqual([]);
  });
});

describe('energyTrendCharts', () => {
  type Line = { name: string; data: [string, number | null][] };
  const lines = (chart: { options: unknown }) => (chart.options as { series: Line[] }).series;

  it('has the four charts of the spec, in order', () => {
    expect(energyTrendCharts([], i18n).map((c) => c.title)).toEqual([
      'trends_solarCapacity', 'trends_electricCars', 'trends_renewableHeating', 'trends_electricity'
    ]);
  });

  it('marks a chart without values as empty', () => {
    const charts = energyTrendCharts([m('20261031', { solarKwp: 5 })], i18n);
    expect(charts[0].options).toBeDefined();
    expect(charts[1].options).toBeUndefined();
    expect(charts[3].options).toBeUndefined();
  });

  it('scales the renewable heating share to percent and keeps its gaps', () => {
    const chart = energyTrendCharts([
      m('20260831', { renewableHeatingShare: 0.25 }), m('20260930'), m('20261031', { renewableHeatingShare: 0.5 })
    ], i18n)[2];
    expect(lines(chart)[0].data).toEqual([['20260831', 25], ['20260930', null], ['20261031', 50]]);
  });

  it('plots one point per distinct period, at its end date', () => {
    const chart = energyTrendCharts([
      m('20260831', { elecConsumptionMwh: 10, elecPeriodUntil: '20260630', renewableProductionMwh: 1, productionPeriodUntil: '20251231' }),
      m('20260930', { elecConsumptionMwh: 10, elecPeriodUntil: '20260630', renewableProductionMwh: 1, productionPeriodUntil: '20251231' }),
      m('20261031', { elecConsumptionMwh: 11, elecPeriodUntil: '20260731', renewableProductionMwh: 1, productionPeriodUntil: '20251231' })
    ], i18n)[3];
    expect(lines(chart).map((s) => s.name)).toEqual(['trends_consumption', 'trends_production']);
    expect(lines(chart)[0].data).toEqual([['20260630', 10], ['20260731', 11]]);
    expect(lines(chart)[1].data).toEqual([['20251231', 1]]);
  });

  it('leaves out the series that has no values when the other one has', () => {
    const chart = energyTrendCharts([m('20261031', { elecConsumptionMwh: 11, elecPeriodUntil: '20260731' })], i18n)[3];
    expect(lines(chart).map((s) => s.name)).toEqual(['trends_consumption']);
  });

  it('survives a document without months', () => {
    expect(energyTrendCharts(undefined, i18n).every((c) => c.options === undefined)).toBe(true);
  });
});

describe('energyTariffCharts', () => {
  it('gives each operator one chart with only its own rows', () => {
    const charts = energyTariffCharts([tariff(2025, 'B', 20), tariff(2026, 'A', 21), tariff(2026, 'B', 22)], i18n, 2026);
    expect(charts.map((c) => c.title)).toEqual(['Netzbetreiber: A', 'Netzbetreiber: B']);
    const years = (i: number) => (charts[i].options as { xAxis: { data: string[] } }).xAxis.data;
    expect(years(0)).toEqual(['2026']);
    expect(years(1)).toEqual(['2025', '2026']);
  });

  it('passes the translated unit to the chart', () => {
    const [chart] = energyTariffCharts([tariff(2026, 'A', 21)], i18n, 2026);
    expect((chart.options as { yAxis: { name: string } }).yAxis.name).toBe('Rp./kWh');
  });

  it('has no chart without tariffs', () => expect(energyTariffCharts(undefined, i18n, 2026)).toEqual([]));
});

describe('hasFutureTariff', () => {
  it('sees a published year after the calendar year', () => {
    expect(hasFutureTariff([tariff(2026, 'A', 21), tariff(2027, 'A', 22)], 2026)).toBe(true);
    expect(hasFutureTariff([tariff(2026, 'A', 21)], 2026)).toBe(false);
    expect(hasFutureTariff(undefined, 2026)).toBe(false);
  });
});

describe('energyHeader', () => {
  it('names the municipality, number, date and all operators', () => {
    expect(energyHeader(figures([], [tariff(2026, 'B', 1), tariff(2026, 'A', 1)]), 'Ort', i18n)).toEqual({
      name: 'Stäfa', facts: 'BFS-Nr. 158 · Stand 31.10.2026', operators: 'Netzbetreiber: A, B'
    });
  });

  it('falls back to the location name and omits what a partial document lacks', () => {
    expect(energyHeader(partial({}), 'Stäfa', i18n)).toEqual({ name: 'Stäfa', facts: 'BFS-Nr. 158', operators: '' });
  });
});

describe('energyStaleNote', () => {
  it('names the date of old figures', () => {
    expect(energyStaleNote('20260831', new Date('2026-11-04T12:00:00Z'), i18n)).toBe('Die Daten stammen vom 31.08.2026.');
  });
  it('stays silent for fresh figures and for a missing date', () => {
    expect(energyStaleNote('20261031', new Date('2026-11-04T12:00:00Z'), i18n)).toBe('');
    expect(energyStaleNote(undefined, new Date('2026-11-04T12:00:00Z'), i18n)).toBe('');
  });
});

describe('compareTarget', () => {
  const location = (over: object = {}) => ({ name: 'Uster', isArchived: false, properties: [{ key: 'bfsNr', value: '198' }], ...over });

  it('takes name and number from a usable location', () => {
    expect(compareTarget(location())).toEqual({ name: 'Uster', bfsNr: 198 });
  });
  it('keeps the name of a location without a number', () => {
    expect(compareTarget(location({ properties: [] }))).toEqual({ name: 'Uster', bfsNr: undefined });
  });
  it('counts a missing or archived location as missing', () => {
    expect(compareTarget(undefined)).toEqual({ name: undefined, bfsNr: undefined });
    expect(compareTarget(location({ isArchived: true }))).toEqual({ name: undefined, bfsNr: undefined });
  });
});

describe('energyCompareRows', () => {
  const main = figures([m('20261031', { electricCarShare: 0.05 })]);

  it('puts the main municipality first and keeps a row for each location without data', () => {
    const rows = energyCompareRows('Stäfa', main, [
      { name: 'Uster', figures: figures([m('20261031', { electricCarShare: 0.1 })]) },
      { name: 'Meilen', figures: undefined }
    ], 'Unbekannter Ort', 2026);
    expect(rows.map((r) => r.name)).toEqual(['Stäfa', 'Uster', 'Meilen']);
    expect(rows[0].electricCarShare).toBe(0.05);
    expect(rows[1].electricCarShare).toBe(0.1);
    expect(rows[2].electricCarShare).toBeUndefined();
  });

  it('gives a location that no longer exists its own text as the name', () => {
    const rows = energyCompareRows('Stäfa', main, [{ name: undefined, figures: undefined }], 'Unbekannter Ort', 2026);
    expect(rows[1].name).toBe('Unbekannter Ort');
  });

  it('has no table without comparison locations', () => {
    expect(energyCompareRows('Stäfa', main, [], 'Unbekannter Ort', 2026)).toEqual([]);
  });
});
