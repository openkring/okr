import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import JSZip from 'jszip';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BaseProperty } from '@okr/shared-models';

import {
  CityLocation, ENERGY_REPORTER_COLUMNS, assertEnergyReporterHeader, bfsNumbersToFetch, buildEnergyPatch, collectReporterRows, currentBfsFromLookup,
  hasCoordinates, isBlockedByStatus, nextBfsStatus, parseCsvLine, parseHeader, rowToMonth, tariffsFromSparql, tenantsPerBfs, tenantsToSync,
} from './energy.util';
import elcomFixture from './elcom.fixture.json';
import lookupFixture from './bfs-lookup.fixture.json';

/**
 * The fixtures are real payloads captured 2026-11-04 (Energie Reporter CSV, ElCom SPARQL on LINDAS,
 * swisstopo `identify`), trimmed to a few rows. Every column and field name in `energy.util.ts` is an
 * assumption about someone else's data until it is run against them, and a wrong name yields a silent null.
 */
const csvLines = readFileSync(fileURLToPath(new URL('./energy-reporter.fixture.csv', import.meta.url)), 'utf-8')
  .split('\n').filter((l) => l.length > 0);
const header = parseHeader(csvLines[0]);

function csvRow(bfsNr: string, date: string): Record<string, string> {
  const line = csvLines.slice(1).find((l) => l.startsWith(`${bfsNr},`) && l.includes(`,${date},`));
  if (!line) throw new Error(`fixture has no row ${bfsNr} ${date}`);
  const cells = parseCsvLine(line);
  return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']));
}
const stafaRow = (date: string) => csvRow('158', date);

function city(okey: string, bfs?: string, tenants: string[] = [], status?: string): CityLocation {
  const properties: BaseProperty[] = [];
  if (bfs !== undefined) properties.push({ key: 'bfsNr', value: bfs });
  if (status !== undefined) properties.push({ key: 'bfsStatus', value: status });
  return { okey, tenants, properties };
}

describe('Energie Reporter CSV', () => {
  it('strips a BOM from the header', () => {
    expect(parseHeader('﻿bfs_nr,municipality')).toEqual(['bfs_nr', 'municipality']);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsvLine('158,"Stäfa, ZH",ZH')).toEqual(['158', 'Stäfa, ZH', 'ZH']);
  });

  it('reads an escaped quote and empty cells', () => {
    expect(parseCsvLine('1,"a ""b"" c",,')).toEqual(['1', 'a "b" c', '', '']);
  });

  it('accepts the real header and names a missing column', () => {
    expect(() => assertEnergyReporterHeader(header)).not.toThrow();
    expect(() => assertEnergyReporterHeader(['bfs_nr'])).toThrow(/energyreporter_date/);
    expect(ENERGY_REPORTER_COLUMNS).toContain('renelec_production_water_mwh_per_year');
  });

  it('stores empty values as null and the date as StoreDate', () => {
    const early = rowToMonth(stafaRow('2021-03-31'));
    expect(early.date).toBe('20210331');
    expect(early.elecConsumptionMwh).toBeNull();
    expect(early.chargingSpotCount).toBeNull();
    expect(early.elecPeriodFrom).toBeNull();
    expect(early.productionPeriodUntil).toBeNull();
    expect(early.electricCarCount).toBe(119);
  });

  it('keeps a real zero as 0 and reads the annual period', () => {
    const late = rowToMonth(stafaRow('2026-10-31'));
    expect(late).toMatchObject({
      electricCarCount: 631, solarKwp: 8592, elecConsumptionMwh: 72527, solarProductionMwh: 7819,
      hydroProductionMwh: 0, elecPeriodFrom: '20250801', elecPeriodUntil: '20260731',
      productionPeriodFrom: '20250801', productionPeriodUntil: '20260731', chargingSpotCount: 15,
    });
  });

  it('maps every column of the table', () => {
    const late = rowToMonth(stafaRow('2026-10-31'));
    expect(late).toEqual({
      date: '20261031', electricCarCount: 631, electricCarShare: 0.077988, chargingSpotCount: 15, solarKwp: 8592,
      solarPotentialUsage: 0.118794, renewableHeatingShare: 0.30811, renewableHeatingCount: 851,
      nonRenewableHeatingCount: 1911, elecPeriodFrom: '20250801', elecPeriodUntil: '20260731',
      productionPeriodFrom: '20250801', productionPeriodUntil: '20260731', elecConsumptionMwh: 72527,
      elecConsumptionHouseholdsMwh: 26298, elecPerCapitaMwh: 4.7302, renewableProductionMwh: 7819,
      solarProductionMwh: 7819, hydroProductionMwh: 0, windProductionMwh: 0, biomassProductionMwh: 0,
      wasteProductionMwh: 0,
    });
  });

  it('reads another municipality from the same file', () => {
    expect(rowToMonth(csvRow('155', '2026-10-31')).electricCarCount).toBe(461);
  });
});

describe('BFS lookup', () => {
  it('takes gde_nr of the row marked as current', () => {
    expect(currentBfsFromLookup(lookupFixture)).toBe(158);
  });

  it('answers undefined when nothing is current or the payload is malformed', () => {
    expect(currentBfsFromLookup({ results: [] })).toBeUndefined();
    expect(currentBfsFromLookup({ results: lookupFixture.results.filter((r) => !r.properties.is_current_jahr) })).toBeUndefined();
    expect(currentBfsFromLookup(undefined)).toBeUndefined();
    expect(currentBfsFromLookup({ results: 'x' })).toBeUndefined();
  });

  it('treats 0/0, missing and non-finite coordinates as no coordinates', () => {
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
    expect(hasCoordinates({})).toBe(false);
    expect(hasCoordinates({ latitude: 47.24 })).toBe(false);
    expect(hasCoordinates({ latitude: Number.NaN, longitude: 8.72 })).toBe(false);
    expect(hasCoordinates({ latitude: 47.24, longitude: 8.72 })).toBe(true);
  });
});

describe('ElCom tariffs', () => {
  it('maps the oldest year first, in Rp./kWh', () => {
    const tariffs = tariffsFromSparql(elcomFixture.stafa);
    expect(tariffs[0]).toEqual({
      year: 2011, operatorName: 'Energie und Wasser, Gemeindewerke Stäfa',
      total: 18.22, energy: 8.01, gridUsage: 9.36, charge: expect.any(Number), aidFee: expect.any(Number),
    });
    expect(tariffs.map((t) => t.year)).toEqual([2011, 2012, 2026]);
  });

  it('sorts even when the response is not ordered', () => {
    const reversed = { ...elcomFixture.stafa, results: { bindings: [...elcomFixture.stafa.results.bindings].reverse() } };
    expect(tariffsFromSparql(reversed).map((t) => t.year)).toEqual([2011, 2012, 2026]);
  });

  it('keeps one row per operator', () => {
    const tariffs = tariffsFromSparql(elcomFixture.maennedorf);
    const in2026 = tariffs.filter((t) => t.year === 2026);
    expect(in2026).toHaveLength(2);
    expect(in2026.map((t) => t.operatorName).sort()).toEqual([
      'Elektrizitätswerke des Kantons Zürich (EKZ)', 'Gemeinde Männedorf, Energieversorung']);
  });

  it('returns an empty list for empty bindings, the caller treats that as «no ElCom data»', () => {
    expect(tariffsFromSparql({ results: { bindings: [] } })).toEqual([]);
  });

  it('throws on a response without a bindings array, so a maintenance page cannot blank the tariffs', () => {
    expect(() => tariffsFromSparql(undefined)).toThrow(/bindings/);
    expect(() => tariffsFromSparql('<html>Wartungsarbeiten</html>')).toThrow(/bindings/);
    expect(() => tariffsFromSparql({ results: {} })).toThrow(/bindings/);
    expect(() => tariffsFromSparql({ error: 'x' })).toThrow(/bindings/);
  });

  it('refuses a row with a value that is not a number', () => {
    const broken = { results: { bindings: [{ ...elcomFixture.stafa.results.bindings[0], total: { type: 'literal', value: 'x' } }] } };
    expect(() => tariffsFromSparql(broken)).toThrow(/total/);
  });
});

describe('tenants and planning', () => {
  it('unions and sorts the tenants of locations that share a BFS number', () => {
    const map = tenantsPerBfs([city('a', '158', ['scs', 'elab']), city('b', '158', ['scs']), city('c', '155', ['kring']), city('d')]);
    expect(map.get(158)).toEqual(['elab', 'scs']);
    expect(map.get(155)).toEqual(['kring']);
    expect(map.size).toBe(2);
  });

  const now = new Date('2026-11-04T03:15:00Z');

  it('skips a municipality that is younger than 7 days', () => {
    expect(bfsNumbersToFetch([city('a', '158')], new Map([[158, '2026-11-01T03:15:00Z']]), now)).toEqual([]);
  });

  it('fetches a municipality that is 7 days or older, unreadable or missing', () => {
    expect(bfsNumbersToFetch([city('a', '158')], new Map([[158, '2026-10-20T03:15:00Z']]), now)).toEqual([158]);
    expect(bfsNumbersToFetch([city('a', '158')], new Map([[158, '2026-10-28T03:15:00Z']]), now)).toEqual([158]);
    expect(bfsNumbersToFetch([city('a', '158')], new Map([[158, 'garbage']]), now)).toEqual([158]);
    expect(bfsNumbersToFetch([city('a', '158')], new Map(), now)).toEqual([158]);
  });

  it('lists each number once, ascending', () => {
    expect(bfsNumbersToFetch([city('a', '158'), city('b', '155'), city('c', '158')], new Map(), now)).toEqual([155, 158]);
  });

  it('ignores locations without a number', () => {
    expect(bfsNumbersToFetch([city('a')], new Map(), now)).toEqual([]);
  });

  it('retries a status-blocked number on Sundays, so a late publication still arrives', () => {
    const sunday = new Date('2026-11-08T03:15:00Z');
    expect(sunday.getUTCDay()).toBe(0);
    expect(bfsNumbersToFetch([city('a', '999', [], '999')], new Map(), sunday)).toEqual([999]);
    expect(bfsNumbersToFetch([city('a', '999', [], '999')], new Map(), new Date('2026-11-07T03:15:00Z'))).toEqual([]);
    // a fresh document still wins on Sunday
    expect(bfsNumbersToFetch([city('a', '158', [], '158')], new Map([[158, '2026-11-07T03:15:00Z']]), sunday)).toEqual([]);
  });

  it('does not want a location blocked by its status, but retries a corrected number', () => {
    expect(bfsNumbersToFetch([city('a', '999', [], '999')], new Map(), now)).toEqual([]);
    expect(bfsNumbersToFetch([city('a', '998', [], '999')], new Map(), now)).toEqual([998]);
  });

  it('blocks only when the status names the current number', () => {
    expect(isBlockedByStatus(city('a', '999', [], '999'))).toBe(true);
    expect(isBlockedByStatus(city('a', '998', [], '999'))).toBe(false);
    expect(isBlockedByStatus(city('a', '158', [], 'none'))).toBe(false);
    expect(isBlockedByStatus(city('a', undefined, [], 'none'))).toBe(false);
    expect(isBlockedByStatus(city('a', '158'))).toBe(false);
  });
});

describe('bfsStatus', () => {
  it('names the number when Energie Reporter has no row for it', () => {
    expect(nextBfsStatus(city('a', '158'), 'noRow')).toBe('158');
  });

  it('is none when the coordinates give no municipality', () => {
    expect(nextBfsStatus(city('a', undefined), 'noMunicipality')).toBe('none');
  });

  it('clears the status once data arrives', () => {
    expect(nextBfsStatus(city('a', '158', [], '158'), 'data')).toBeUndefined();
  });
});

describe('buildEnergyPatch', () => {
  const now = new Date('2026-11-04T03:15:00.000Z');
  const months = [rowToMonth(stafaRow('2026-10-31')), rowToMonth(stafaRow('2021-03-31'))]; // deliberately newest first
  const reporter = { municipality: 'Stäfa', canton: 'ZH', months };
  const tariffs = tariffsFromSparql(elcomFixture.stafa);

  it('writes only the Energie Reporter fields when only that source succeeded', () => {
    const patch = buildEnergyPatch({ bfsNr: 158, tenants: ['scs'], now, reporter });
    expect(Object.keys(patch).sort()).toEqual(['bfsNr', 'canton', 'isArchived', 'months', 'municipality', 'sourceDate', 'tenants']);
    expect(patch['isArchived']).toBe(false);
    expect(patch['tenants']).toEqual(['scs']);
    expect(patch['bfsNr']).toBe(158);
    expect(patch['municipality']).toBe('Stäfa');
    expect(patch['canton']).toBe('ZH');
  });

  it('writes only the tariffs when only ElCom succeeded', () => {
    const patch = buildEnergyPatch({ bfsNr: 158, tenants: ['scs'], now, tariffs });
    expect(Object.keys(patch).sort()).toEqual(['bfsNr', 'isArchived', 'tariffs', 'tenants']);
    expect(patch['tariffs']).toEqual(tariffs);
  });

  it('writes everything, including fetchedAt, when both succeeded', () => {
    const patch = buildEnergyPatch({ bfsNr: 158, tenants: ['kring', 'scs'], now, reporter, tariffs });
    expect(Object.keys(patch).sort()).toEqual(['bfsNr', 'canton', 'fetchedAt', 'isArchived', 'months', 'municipality', 'sourceDate', 'tariffs', 'tenants']);
    expect(patch['fetchedAt']).toBe('2026-11-04T03:15:00.000Z');
  });

  it('sorts the months oldest first and takes sourceDate from the newest', () => {
    const patch = buildEnergyPatch({ bfsNr: 158, tenants: ['scs'], now, reporter });
    expect((patch['months'] as { date: string }[]).map((m) => m.date)).toEqual(['20210331', '20261031']);
    expect(patch['sourceDate']).toBe('20261031');
    expect(months.map((m) => m.date)).toEqual(['20261031', '20210331']); // the input is not reordered
  });

  it('treats empty tariffs as no ElCom data: nothing written, fetchedAt does not move', () => {
    const patch = buildEnergyPatch({ bfsNr: 158, tenants: ['scs'], now, reporter, tariffs: [] });
    expect('tariffs' in patch).toBe(false);
    expect('fetchedAt' in patch).toBe(false);
    expect(Object.keys(buildEnergyPatch({ bfsNr: 99999, tenants: ['scs'], now, tariffs: [] })).sort()).toEqual(['bfsNr', 'isArchived', 'tenants']);
  });

  it('treats a reporter without months as no Energie Reporter source', () => {
    const patch = buildEnergyPatch({ bfsNr: 158, tenants: ['scs'], now, reporter: { ...reporter, months: [] }, tariffs });
    expect(Object.keys(patch).sort()).toEqual(['bfsNr', 'isArchived', 'tariffs', 'tenants']);
  });
});

describe('collectReporterRows', () => {
  async function* lines(all: string[]): AsyncGenerator<string> { for (const l of all) yield l; }

  it('keeps only the wanted municipalities, with name, canton and every month', async () => {
    const { found, failed } = await collectReporterRows(lines(csvLines), new Set([158]));
    expect([...found.keys()]).toEqual([158]);
    expect(failed.size).toBe(0);
    const stafa = found.get(158);
    expect(stafa?.municipality).toBe('Stäfa');
    expect(stafa?.canton).toBe('ZH');
    expect(stafa?.months.map((m) => m.date)).toEqual(['20210331', '20261031']);
  });

  it('leaves a wanted number without a row out of the result, so the caller can tell «no row»', async () => {
    const { found, failed } = await collectReporterRows(lines(csvLines), new Set([158, 99999]));
    expect(found.has(99999)).toBe(false);
    expect(failed.has(99999)).toBe(false);
  });

  it('fails one municipality alone when its row is malformed', async () => {
    const broken = csvLines.map((l) => (l.startsWith('158,') && l.includes(',2021-03-31,') ? l.replace(',2021-03-31,', ',not-a-date,') : l));
    const { found, failed } = await collectReporterRows(lines(broken), new Set([155, 158]));
    expect([...failed.keys()]).toEqual([158]);
    expect(found.has(158)).toBe(false);
    expect(found.get(155)?.municipality).toBe('Männedorf');
  });

  it('fails a municipality whose row is cut short, instead of storing a month of gaps', async () => {
    const short = csvLines.map((l) => (l.startsWith('158,') && l.includes(',2026-10-31,') ? l.split(',').slice(0, 6).join(',') : l));
    const { found, failed } = await collectReporterRows(lines(short), new Set([155, 158]));
    expect([...failed.keys()]).toEqual([158]);
    expect(found.has(158)).toBe(false);
    expect(found.has(155)).toBe(true);
  });

  it('fails a municipality whose row has an extra cell, which would shift every later figure', async () => {
    const long = csvLines.map((l) => (l.startsWith('158,') && l.includes(',2026-10-31,') ? l.replace(',2026-10-31,', ',2026-10-31,,') : l));
    const { found, failed } = await collectReporterRows(lines(long), new Set([155, 158]));
    expect([...failed.keys()]).toEqual([158]);
    expect(found.has(158)).toBe(false);
    expect(failed.get(158)?.message).toMatch(/cells/);
  });

  it('throws when the header lacks an expected column', async () => {
    await expect(collectReporterRows(lines(['bfs_nr,municipality', '158,Stäfa']), new Set([158]))).rejects.toThrow(/missing column/);
  });

  it('throws on an empty file', async () => {
    await expect(collectReporterRows(lines([]), new Set([158]))).rejects.toThrow(/empty/);
  });

  it('skips blank lines and reads a header with a byte order mark', async () => {
    const withBom = ['﻿' + csvLines[0], '', ...csvLines.slice(1), ''];
    const { found } = await collectReporterRows(lines(withBom), new Set([158]));
    expect(found.get(158)?.months).toHaveLength(2);
  });
});

describe('tenantsToSync', () => {
  it('returns only the numbers whose tenant list differs, ignoring order', () => {
    const wanted = new Map([[158, ['kring', 'scs']], [155, ['scs']], [1, ['a']]]);
    const existing = new Map([[158, ['scs', 'kring']], [155, ['scs', 'kring']]]);
    expect([...tenantsToSync(wanted, existing)]).toEqual([[155, ['scs']]]);
  });

  it('adds a tenant that joined a shared municipality', () => {
    const synced = tenantsToSync(new Map([[158, ['kring', 'scs']]]), new Map([[158, ['scs']]]));
    expect(synced.get(158)).toEqual(['kring', 'scs']);
  });

  it('empties the tenants of a document whose last location is gone, but does not touch an already empty one', () => {
    const synced = tenantsToSync(new Map([[155, ['scs']]]), new Map([[158, ['scs']], [155, ['scs']], [7, []]]));
    expect([...synced]).toEqual([[158, []]]);
  });

  it('ignores a number without an existing document: it is about to be fetched', () => {
    expect(tenantsToSync(new Map([[158, ['scs']]]), new Map()).size).toBe(0);
  });

  it('treats duplicates in the stored list as the same set', () => {
    expect(tenantsToSync(new Map([[158, ['scs']]]), new Map([[158, ['scs', 'scs']]])).size).toBe(0);
  });
});

describe('collectReporterRows through a real ZIP', () => {
  it('reads a BOM-prefixed CSV out of an in-memory ZIP via file.nodeStream() and readline', async () => {
    const zip = new JSZip();
    zip.file('energyreporter_municipality_historized.csv', '\ufeff' + csvLines.join('\r\n') + '\r\n');
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    const file = loaded.file('energyreporter_municipality_historized.csv');
    expect(file).not.toBeNull();
    const input = file!.nodeStream();
    let ended = false;
    input.once('end', () => { ended = true; });
    const { found, failed } = await collectReporterRows(createInterface({ input, crlfDelay: Infinity }), new Set([155, 158]));
    expect(ended).toBe(true);
    expect(failed.size).toBe(0);
    expect(found.get(158)?.months.map((m) => m.date)).toEqual(['20210331', '20261031']);
    expect(found.get(155)?.municipality).toBe('Männedorf');
  });
});
