import { describe, expect, it } from 'vitest';

import { AOC_STATUS_SERVICES, StatusService, StatusSource } from '@okr/aoc-util';

import { parseFeed } from './status-parsers';

const service = (id: string): StatusService => {
  const found = AOC_STATUS_SERVICES.find(s => s.id === id);
  if (!found) throw new Error(`no service ${id}`);
  return found;
};
const levelOf = (id: string, body: unknown, label: string) => parseFeed(service(id), body).parts[label]?.level;

describe('betterstack', () => {
  const body = (status: string) => ({
    data: { attributes: { aggregate_state: 'operational' } },
    included: [
      { type: 'status_page_section', attributes: { name: 'Current status by service' } },
      {
        type: 'status_page_resource',
        attributes: {
          public_name: 'Frontend App',
          status,
          status_history: [
            { day: '2026-11-03', status: 'operational', downtime_duration: 0 },
            { day: '2026-11-04', status: 'downtime', downtime_duration: 60 },
          ],
        },
      },
    ],
  });

  it.each([
    ['operational', 'ok'],
    ['downtime', 'down'],
    ['degraded', 'degraded'],
    ['maintenance', 'maintenance'],
  ])('maps %s to %s', (status, level) => {
    expect(levelOf('kring', body(status), 'Frontend App')).toBe(level);
  });

  it('keeps the daily history', () => {
    expect(parseFeed(service('kring'), body('operational')).parts['Frontend App'].history).toEqual([
      { day: '2026-11-03', status: 'operational' },
      { day: '2026-11-04', status: 'downtime' },
    ]);
  });
});

describe('statuspage', () => {
  const body = (status: string) => ({ components: [{ name: 'Actions', status, group: false }, { name: 'Git Operations', status: 'operational', group: false }] });

  it.each([
    ['operational', 'ok'],
    ['degraded_performance', 'degraded'],
    ['partial_outage', 'degraded'],
    ['major_outage', 'down'],
    ['under_maintenance', 'maintenance'],
  ])('maps %s to %s', (status, level) => {
    expect(levelOf('github', body(status), 'Actions')).toBe(level);
  });

  it('ignores a group row of the same name', () => {
    const groups = { components: [{ name: 'Content Delivery Network', status: 'major_outage', group: true }, { name: 'Content Delivery Network', status: 'operational', group: false }] };
    expect(levelOf('imgix', groups, 'Content Delivery Network')).toBe('ok');
  });
});

describe('instatus', () => {
  it.each([
    ['OPERATIONAL', 'ok'],
    ['DEGRADEDPERFORMANCE', 'degraded'],
    ['PARTIALOUTAGE', 'degraded'],
    ['MAJOROUTAGE', 'down'],
    ['UNDERMAINTENANCE', 'maintenance'],
  ])('maps %s to %s', (status, level) => {
    expect(levelOf('deepcloud', { components: [{ name: 'DeepSign', status }] }, 'DeepSign')).toBe(level);
  });
});

describe('google', () => {
  const incident = (over: Record<string, unknown> = {}) => ({
    begin: '2026-11-04T10:00:00+00:00',
    status_impact: 'SERVICE_DISRUPTION',
    affected_products: [{ title: 'Hosting', id: 'x' }],
    ...over,
  });

  it('reads no incident as ok', () => {
    expect(levelOf('firebase', [], 'Hosting')).toBe('ok');
  });

  it('reads an open disruption as degraded', () => {
    expect(levelOf('firebase', [incident()], 'Hosting')).toBe('degraded');
  });

  it('reads an open outage as down', () => {
    expect(levelOf('firebase', [incident({ status_impact: 'SERVICE_OUTAGE' })], 'Hosting')).toBe('down');
  });

  it('does not count a service information', () => {
    expect(levelOf('firebase', [incident({ status_impact: 'SERVICE_INFORMATION' })], 'Hosting')).toBe('ok');
  });

  it('does not count a closed incident', () => {
    expect(levelOf('firebase', [incident({ end: '2026-11-04T11:00:00+00:00', status_impact: 'SERVICE_OUTAGE' })], 'Hosting')).toBe('ok');
  });

  it('does not touch a part the incident does not list', () => {
    expect(levelOf('firebase', [incident()], 'Authentication')).toBe('ok');
  });

  it('takes the worst of several open incidents', () => {
    expect(levelOf('firebase', [incident(), incident({ status_impact: 'SERVICE_OUTAGE' }), incident()], 'Hosting')).toBe('down');
  });

  describe('Google Cloud region', () => {
    const cloud = (locations: string[]) => [incident({
      affected_products: [{ title: 'Cloud Run', id: 'y' }],
      currently_affected_locations: locations.map(id => ({ id, title: id })),
    })];

    it('skips an incident elsewhere', () => {
      expect(levelOf('googleCloud', cloud(['us-east1']), 'Cloud Run')).toBe('ok');
    });

    it('counts our region', () => {
      expect(levelOf('googleCloud', cloud(['us-east1', 'europe-west6']), 'Cloud Run')).toBe('degraded');
    });

    it('counts a global incident', () => {
      expect(levelOf('googleCloud', cloud(['global']), 'Cloud Run')).toBe('degraded');
    });

    it('counts an open incident with no location yet', () => {
      expect(levelOf('googleCloud', cloud([]), 'Cloud Run')).toBe('degraded');
    });

    it('does not apply to Firebase, whose feed has no locations', () => {
      expect(levelOf('firebase', [incident({ currently_affected_locations: [{ id: 'us-east1' }] })], 'Hosting')).toBe('degraded');
    });
  });
});

describe('apple', () => {
  const body = (events: unknown[]) => `jsonCallback(${JSON.stringify({ drMessage: null, services: [{ serviceName: 'APNS', events }, { serviceName: 'App Attest', events: [] }] })});`;

  it('reads no event as ok', () => {
    expect(levelOf('apple', body([]), 'App Attest')).toBe('ok');
  });

  it('reads an ongoing issue as degraded', () => {
    expect(levelOf('apple', body([{ eventStatus: 'ongoing', statusType: 'Issue' }]), 'APNS')).toBe('degraded');
  });

  it('reads an ongoing outage as degraded, since Apple gives no scale', () => {
    expect(levelOf('apple', body([{ eventStatus: 'ongoing', statusType: 'Outage' }]), 'APNS')).toBe('degraded');
  });

  it('reads ongoing maintenance as maintenance', () => {
    expect(levelOf('apple', body([{ eventStatus: 'ongoing', statusType: 'Maintenance' }]), 'APNS')).toBe('maintenance');
  });

  it.each(['resolved', 'completed'])('does not count a %s event', (eventStatus) => {
    expect(levelOf('apple', body([{ eventStatus, statusType: 'Issue' }]), 'APNS')).toBe('ok');
  });
});

describe('gatus', () => {
  const body = (success: boolean) => [{ name: 'Main website', results: [] }, { name: 'API', results: [{ success: !success }, { success }] }];

  it('reads a passing last result as ok', () => {
    expect(levelOf('opensky', body(true), 'API')).toBe('ok');
  });

  it('reads a failing last result as down', () => {
    expect(levelOf('opensky', body(false), 'API')).toBe('down');
  });
});

describe('a feed we cannot read', () => {
  const live = AOC_STATUS_SERVICES.filter(s => s.source !== 'none');
  const sources = [...new Set(live.map(s => s.source))] as StatusSource[];
  const oneOf = (source: StatusSource) => live.find(s => s.source === source) as StatusService;

  describe.each(sources)('%s', (source) => {
    it.each([['html', '<html></html>'], ['an empty object', {}], ['null', null], ['a number', 7]])('gives unknown for %s', (_name, body) => {
      const parsed = parseFeed(oneOf(source), body);
      for (const part of oneOf(source).parts) expect(parsed.parts[part.label], part.label).toEqual({ level: 'unknown' });
    });
  });

  it('reads a renamed statuspage component as unknown, not ok', () => {
    expect(levelOf('github', { components: [{ name: 'Git', status: 'operational', group: false }] }, 'Git Operations')).toBe('unknown');
  });

  it('reads a renamed betterstack resource as unknown, not ok', () => {
    expect(levelOf('kring', { included: [{ type: 'status_page_resource', attributes: { public_name: 'Web', status: 'operational' } }] }, 'Frontend App')).toBe('unknown');
  });

  it('reads an unknown component status as unknown', () => {
    expect(levelOf('github', { components: [{ name: 'Actions', status: 'on_fire', group: false }] }, 'Actions')).toBe('unknown');
  });
});

describe('the parsed result', () => {
  it('holds every part of the service, also ones the feed lacks', () => {
    expect(Object.keys(parseFeed(service('github'), { components: [] }).parts)).toEqual(['Git Operations', 'Actions']);
  });

  it('has no parts for a link-only service', () => {
    expect(parseFeed(service('mailtrap'), {})).toEqual({ parts: {} });
  });

  // Firestore admin rejects undefined and writeCache swallows the error, so the cache would never fill.
  it('holds no undefined value', () => {
    const parsed = parseFeed(service('kring'), { included: [{ type: 'status_page_resource', attributes: { public_name: 'Frontend App', status: 'operational' } }] });
    expect(JSON.parse(JSON.stringify(parsed))).toStrictEqual(parsed);
    expect(Object.keys(parsed.parts['Frontend App'])).toEqual(['level']);
  });
});
