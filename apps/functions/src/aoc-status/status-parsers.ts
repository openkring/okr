import type { PartStatus, ServiceStatus, StatusLevel, StatusService, StatusSource } from '@okr/aoc-util';

const UNKNOWN: PartStatus = { level: 'unknown' };

/** Google Cloud incidents outside these locations do not touch us (functions run in europe-west6). */
const HOME_LOCATIONS = new Set(['europe-west6', 'global']);

/** Better Stack, Statuspage and Instatus spellings, compared lowercase without underscores. */
const STATUS_LEVELS: Record<string, StatusLevel> = {
  operational: 'ok',
  recovered: 'ok',
  degraded: 'degraded',
  degradedperformance: 'degraded',
  partialoutage: 'degraded',
  downtime: 'down',
  majoroutage: 'down',
  maintenance: 'maintenance',
  undermaintenance: 'maintenance',
};

type Json = Record<string, unknown>;

/** The status of one part by its label; undefined = the feed does not mention it. */
type PartReader = (label: string) => PartStatus | undefined;

const asRecords = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(v => typeof v === 'object' && v !== null) : []);

const toPartStatus = (status: unknown): PartStatus => ({
  level: STATUS_LEVELS[String(status).toLowerCase().replace(/_/g, '')] ?? 'unknown',
});

function readerFromMap(map: Map<string, PartStatus>): PartReader {
  return label => map.get(label);
}

function readBetterStack(body: unknown): PartReader | undefined {
  const included = (body as Json | null)?.['included'];
  if (!Array.isArray(included)) return undefined;
  const resources = asRecords(included)
    .filter(r => r['type'] === 'status_page_resource')
    .map(r => r['attributes'] as Json);
  return readerFromMap(new Map(resources.map(a => {
    const history = asRecords(a['status_history']).map(d => ({ day: String(d['day']), status: String(d['status']) }));
    // no `history: undefined`: Firestore admin rejects it, and writeCache swallows the error
    return [String(a['public_name']), { ...toPartStatus(a['status']), ...(history.length ? { history } : {}) }];
  })));
}

/** Statuspage and Instatus: a flat `components` list. A group row repeats a child's name on imgix. */
function readComponents(body: unknown): PartReader | undefined {
  const components = (body as Json | null)?.['components'];
  if (!Array.isArray(components)) return undefined;
  return readerFromMap(new Map(asRecords(components)
    .filter(c => c['group'] !== true)
    .map(c => [String(c['name']), toPartStatus(c['status'])])));
}

function touchesHome(incident: Json): boolean {
  const locations = asRecords(incident['currently_affected_locations']);
  return locations.length === 0 || locations.some(l => HOME_LOCATIONS.has(String(l['id'])));
}

/**
 * An incidents feed only names what is broken, so a part it does not list is ok. That would keep a
 * retired product green forever, so with a readable product list a label missing from it is unknown.
 * Without one the part stays ok: a failed list says nothing about the service.
 */
function readGoogle(body: unknown, service: StatusService, catalog: unknown): PartReader | undefined {
  if (!Array.isArray(body)) return undefined;
  const products = (catalog as Json | null | undefined)?.['products'];
  const known = Array.isArray(products) ? new Set(asRecords(products).map(p => p['title'])) : undefined;
  const open = asRecords(body)
    .filter(i => !i['end'] && i['status_impact'] !== 'SERVICE_INFORMATION')
    .filter(i => service.id !== 'googleCloud' || touchesHome(i));
  return label => {
    if (known && !known.has(label)) return undefined;
    const touching = open.filter(i => asRecords(i['affected_products']).some(p => p['title'] === label));
    if (touching.some(i => i['status_impact'] === 'SERVICE_OUTAGE')) return { level: 'down' };
    return { level: touching.length ? 'degraded' : 'ok' };
  };
}

/** The feed is JSONP: `jsonCallback({...});`. Apple gives no scale, so an ongoing event is degraded. */
function readApple(body: unknown): PartReader | undefined {
  if (typeof body !== 'string') return undefined;
  const parsed = JSON.parse(body.slice(body.indexOf('(') + 1, body.lastIndexOf(')'))) as Json;
  const services = asRecords(parsed['services']);
  return label => {
    const found = services.find(s => s['serviceName'] === label);
    if (!found) return undefined;
    const ongoing = asRecords(found['events']).filter(e => e['eventStatus'] === 'ongoing');
    if (ongoing.some(e => e['statusType'] !== 'Maintenance')) return { level: 'degraded' };
    return { level: ongoing.length ? 'maintenance' : 'ok' };
  };
}

function readGatus(body: unknown): PartReader | undefined {
  if (!Array.isArray(body)) return undefined;
  const endpoints = asRecords(body);
  return label => {
    const last = asRecords(endpoints.find(e => e['name'] === label)?.['results']).at(-1);
    if (!last) return undefined;
    return { level: last['success'] === true ? 'ok' : 'down' };
  };
}

const READERS: Record<Exclude<StatusSource, 'none'>, (body: unknown, service: StatusService, catalog: unknown) => PartReader | undefined> = {
  betterstack: readBetterStack,
  statuspage: readComponents,
  instatus: readComponents,
  google: readGoogle,
  apple: readApple,
  gatus: readGatus,
};

/**
 * Reduces a feed to the catalogue's parts. Never throws: a feed we cannot read, or a part it does
 * not mention, is `unknown`, never `ok`.
 */
export function parseFeed(service: StatusService, body: unknown, catalog?: unknown): ServiceStatus {
  if (service.source === 'none') return { parts: {} };
  let read: PartReader | undefined;
  try {
    read = READERS[service.source](body, service, catalog);
  } catch {
    read = undefined;
  }
  return { parts: Object.fromEntries(service.parts.map(p => [p.label, read?.(p.label) ?? UNKNOWN])) };
}
