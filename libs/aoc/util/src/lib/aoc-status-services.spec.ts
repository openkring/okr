import { describe, expect, it } from 'vitest';

import {
  AOC_STATUS_SERVICES,
  ServiceStatus,
  ServiceStatusResult,
  StatusLevel,
  StatusService,
  serviceLevel,
  sortByProblem,
  visibleParts,
  visibleStatusServices,
} from './aoc-status-services';

const on = (...blocks: string[]) => (block: string) => blocks.includes(block);
const service = (id: string): StatusService => {
  const found = AOC_STATUS_SERVICES.find(s => s.id === id);
  if (!found) throw new Error(`no service ${id}`);
  return found;
};
const levels = (parts: Record<string, StatusLevel>): ServiceStatus => ({
  parts: Object.fromEntries(Object.entries(parts).map(([label, level]) => [label, { level }])),
});

describe('AOC_STATUS_SERVICES', () => {
  it('has unique ids', () => {
    const ids = AOC_STATUS_SERVICES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives a service with a live source a feed url and parts', () => {
    for (const s of AOC_STATUS_SERVICES.filter(x => x.source !== 'none')) {
      expect(s.feedUrl, s.id).toMatch(/^https:\/\//);
      expect(s.parts.length, s.id).toBeGreaterThan(0);
    }
  });

  it('gives a link-only service no parts and no feed url', () => {
    for (const s of AOC_STATUS_SERVICES.filter(x => x.source === 'none')) {
      expect(s.parts, s.id).toEqual([]);
      expect(s.feedUrl, s.id).toBeUndefined();
    }
  });

  it('keeps every status url https or empty', () => {
    for (const s of AOC_STATUS_SERVICES) expect(s.statusUrl, s.id).toMatch(/^(https:\/\/.+)?$/);
  });

  it('names at least one feature block per service', () => {
    for (const s of AOC_STATUS_SERVICES) expect(s.featureBlocks.length, s.id).toBeGreaterThan(0);
  });
});

describe('visibleStatusServices', () => {
  it('shows a service when any of its blocks is on', () => {
    const ids = (isEnabled: (b: string) => boolean) => visibleStatusServices(AOC_STATUS_SERVICES, isEnabled).map(s => s.id);
    expect(ids(on('finance'))).toContain('bexio');
    expect(ids(on('cms'))).not.toContain('bexio');
  });
});

describe('visibleParts', () => {
  const labels = (isEnabled: (b: string) => boolean) => visibleParts(service('kring'), isEnabled).map(p => p.label);

  it('hides the Matrix part without chat', () => {
    expect(labels(on('auth'))).toEqual(['Frontend App', 'Firebase Cloud Functions']);
  });

  it('shows the Matrix part with chat', () => {
    expect(labels(on('auth', 'chat'))).toEqual(['Frontend App', 'Firebase Cloud Functions', 'Matrix Server']);
  });
});

describe('serviceLevel', () => {
  const kringWith = (matrix: StatusLevel) => levels({ 'Frontend App': 'ok', 'Firebase Cloud Functions': 'ok', 'Matrix Server': matrix });

  it('ignores a hidden part', () => {
    expect(serviceLevel(service('kring'), kringWith('down'), on('auth'))).toBe('ok');
  });

  it('counts a visible part', () => {
    expect(serviceLevel(service('kring'), kringWith('down'), on('auth', 'chat'))).toBe('down');
  });

  it.each<[StatusLevel, StatusLevel, StatusLevel]>([
    ['down', 'degraded', 'down'],
    ['degraded', 'maintenance', 'degraded'],
    ['maintenance', 'unknown', 'maintenance'],
    ['unknown', 'ok', 'unknown'],
    ['ok', 'ok', 'ok'],
  ])('takes the worst of %s and %s', (git, actions, expected) => {
    expect(serviceLevel(service('github'), levels({ 'Git Operations': git, Actions: actions }), on('auth'))).toBe(expected);
  });

  it('reads a part missing from the status as unknown', () => {
    expect(serviceLevel(service('github'), levels({ 'Git Operations': 'ok' }), on('auth'))).toBe('unknown');
  });

  it('reads a missing status as unknown', () => {
    expect(serviceLevel(service('github'), undefined, on('auth'))).toBe('unknown');
  });

  it('gives a link-only service no level', () => {
    expect(serviceLevel(service('mailtrap'), undefined, on('auth'))).toBe('none');
  });
});

describe('sortByProblem', () => {
  const allOk = (): ServiceStatusResult => ({
    checkedAt: '2026-11-04T12:00:00.000Z',
    services: Object.fromEntries(AOC_STATUS_SERVICES.map(s => [s.id, levels(Object.fromEntries(s.parts.map(p => [p.label, 'ok' as StatusLevel])))])),
  });
  const everything = () => true;

  it('keeps catalogue order without a result', () => {
    expect(sortByProblem(AOC_STATUS_SERVICES, undefined, everything)).toEqual([...AOC_STATUS_SERVICES]);
  });

  it('moves a service with a problem to the front and keeps the rest in order', () => {
    const result = allOk();
    result.services['github'] = levels({ 'Git Operations': 'ok', Actions: 'degraded' });
    const sorted = sortByProblem(AOC_STATUS_SERVICES, result, everything);
    expect(sorted[0].id).toBe('github');
    expect(sorted.slice(1)).toEqual(AOC_STATUS_SERVICES.filter(s => s.id !== 'github'));
  });

  it('puts an outage before a degraded service', () => {
    const result = allOk();
    result.services['github'] = levels({ 'Git Operations': 'ok', Actions: 'degraded' });
    result.services['imgix'] = levels({ 'Rendering Infrastructure': 'down', 'Content Delivery Network': 'ok', 'Google Cloud Storage': 'ok' });
    expect(sortByProblem(AOC_STATUS_SERVICES, result, everything).slice(0, 2).map(s => s.id)).toEqual(['imgix', 'github']);
  });
});
