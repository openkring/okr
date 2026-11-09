/**
 * Spec 1.137 — how a service reports its status. `none` = link only, no live status.
 * `internal` = our own check, read from a result document instead of a feed (spec 1.143).
 */
export type StatusSource = 'betterstack' | 'statuspage' | 'instatus' | 'google' | 'apple' | 'gatus' | 'internal' | 'none';

/** Spec 1.143: the receiver self-test row and its one part. */
export const WEBHOOK_RECEIVER_SERVICE_ID = 'webhook-receiver';
export const WEBHOOK_RECEIVER_PART = 'Selbsttest';

export type StatusLevel = 'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown';

export interface StatusPart {
  /** Shown on the page, and the name matched in the feed. */
  label: string;
  /** Narrows the service's own blocks; absent = always with the service. */
  featureBlocks?: string[];
}

export interface StatusService {
  id: string;
  name: string;
  /** '' when the provider has no status page. Never invent one. */
  statusUrl: string;
  source: StatusSource;
  feedUrl?: string;
  /** Google only: its product list. An incidents feed alone cannot tell that a label no longer exists. */
  catalogUrl?: string;
  /** Shown when ANY of these is on. */
  featureBlocks: string[];
  parts: StatusPart[];
}

export interface StatusHistoryDay {
  day: string;
  status: string;
}

export interface PartStatus {
  level: StatusLevel;
  history?: StatusHistoryDay[];
}

export interface ServiceStatus {
  parts: Record<string, PartStatus>;
}

/** What `getServiceStatus` returns. Nothing in it is tenant-specific: the page does the filtering. */
export interface ServiceStatusResult {
  checkedAt: string;
  services: Record<string, ServiceStatus>;
}

function live(
  id: string,
  name: string,
  statusUrl: string,
  source: StatusSource,
  feedUrl: string,
  featureBlocks: string[],
  parts: (string | StatusPart)[],
  catalogUrl?: string,
): StatusService {
  return {
    id, name, statusUrl, source, feedUrl, featureBlocks,
    ...(catalogUrl ? { catalogUrl } : {}),
    parts: parts.map(p => (typeof p === 'string' ? { label: p } : p)),
  };
}

function linkOnly(id: string, name: string, statusUrl: string, featureBlocks: string[]): StatusService {
  return { id, name, statusUrl, source: 'none', featureBlocks, parts: [] };
}

/**
 * Every external service the platform calls, whether or not personal data goes there
 * (`privacy-model` rule 4). `auth` and `geo` are core blocks, so those rows show for every tenant.
 * `parts` lists only what we use: a provider-wide incident that does not touch them is not ours.
 * Display order = array order, problems first (`sortByProblem`).
 */
export const AOC_STATUS_SERVICES: readonly StatusService[] = [
  live('kring', 'kring', 'https://status.kring.ch', 'betterstack', 'https://status.kring.ch/index.json', ['auth'], [
    'Frontend App',
    'Firebase Cloud Functions',
    { label: 'Matrix Server', featureBlocks: ['chat'] },
  ]),
  live('github', 'GitHub', 'https://www.githubstatus.com', 'statuspage', 'https://www.githubstatus.com/api/v2/summary.json', ['auth'], [
    'Git Operations',
    'Actions',
  ]),
  live('firebase', 'Firebase', 'https://status.firebase.google.com', 'google', 'https://status.firebase.google.com/incidents.json', ['auth'], [
    'Hosting',
    'Authentication',
    'Cloud Messaging',
    'Cloud Storage',
    'App Check',
  ], 'https://status.firebase.google.com/products.json'),
  live('googleCloud', 'Google Cloud', 'https://status.cloud.google.com', 'google', 'https://status.cloud.google.com/incidents.json', ['auth'], [
    'Cloud Firestore',
    'Google Cloud Functions',
    'Cloud Run',
    'Google Cloud Scheduler',
    'Secret Manager',
    { label: 'Cloud Translation', featureBlocks: ['instruments'] },
  ], 'https://status.cloud.google.com/products.json'),
  live('imgix', 'imgix', 'https://status.imgix.com', 'statuspage', 'https://status.imgix.com/api/v2/summary.json', ['auth'], [
    'Rendering Infrastructure',
    'Content Delivery Network',
    'Google Cloud Storage',
  ]),
  live('sentry', 'Sentry', 'https://status.sentry.io', 'statuspage', 'https://status.sentry.io/api/v2/summary.json', ['auth'], [
    'EU Error Ingestion',
    'EU Errors Alerting',
    'Dashboard',
  ]),
  live('apple', 'Apple', 'https://developer.apple.com/system-status/', 'apple', 'https://www.apple.com/support/systemstatus/data/developer/system_status_en_US.js', ['auth'], [
    'APNS',
    'App Attest',
  ]),
  live('googleMaps', 'Google Maps', 'https://status.cloud.google.com/maps-platform/', 'google', 'https://status.cloud.google.com/maps-platform/incidents.json', ['geo'], [
    'Maps JavaScript API',
    'Maps Tile API',
    'Geocoding API',
    'Places API',
  ], 'https://status.cloud.google.com/maps-platform/products.json'),
  // Shared by every tenant; shown wherever a feature receives webhooks (email delivery, e-signing).
  { id: WEBHOOK_RECEIVER_SERVICE_ID, name: 'Webhook-Empfang', statusUrl: '', source: 'internal', featureBlocks: ['auth', 'esign'], parts: [{ label: WEBHOOK_RECEIVER_PART }] },
  linkOnly('mailtrap', 'Mailtrap', 'https://status.mailtrap.info', ['auth']),
  // Block 'auth' is a core block, so the row shows for every tenant (mailtrap precedent).
  linkOnly('stripe', 'Stripe', 'https://status.stripe.com', ['auth']),
  linkOnly('googleAnalytics', 'Google Analytics', '', ['consent']),
  linkOnly('gemini', 'Gemini', 'https://aistudio.google.com/status', ['cms', 'finance', 'contracts']),
  linkOnly('swisstopo', 'swisstopo', 'https://docs.geo.admin.ch/page/status-page.html', ['geo']),
  linkOnly('openStreetMap', 'OpenStreetMap', '', ['geo']),
  linkOnly('what3words', 'what3words', '', ['geo']),
  linkOnly('searchCh', 'search.ch', '', ['subject']),
  linkOnly('zefix', 'Zefix', '', ['subject']),
  linkOnly('youtube', 'YouTube', '', ['news-center']),
  live('bexio', 'bexio', 'https://www.bexio-status.com', 'statuspage', 'https://bexio.statuspage.io/api/v2/summary.json', ['finance'], ['API']),
  linkOnly('snb', 'Schweizerische Nationalbank', '', ['finance']),
  live('deepcloud', 'DeepCloud', 'https://status.deepcloud.swiss', 'instatus', 'https://status.deepcloud.swiss/v2/components.json', ['esign'], [
    'DeepSign',
    'Swisscom Trust Services',
  ]),
  linkOnly('etke', 'etke.cc', '', ['chat']), // its Matrix server is covered by the kring row
  linkOnly('openMeteo', 'Open-Meteo', 'https://status.open-meteo.com', ['weather']),
  linkOnly('rainViewer', 'RainViewer', 'https://status.rainviewer.com', ['weather']),
  live('opensky', 'OpenSky', 'https://status.opensky-network.org', 'gatus', 'https://status.opensky-network.org/api/v1/endpoints/statuses', ['mobility'], ['API']),
  linkOnly('aviationstack', 'aviationstack', 'https://status.aviationstack.com', ['mobility']),
  linkOnly('openTransportData', 'Open Transport Data', 'https://status.opentransportdata.swiss', ['mobility', 'trip']),
  linkOnly('regasoft', 'Regasoft', '', ['relationship']),
  linkOnly('lindas', 'Energiedaten des Bundes (LINDAS)', '', ['energy']),
  linkOnly('geoimpact', 'geoimpact', '', ['energy']),
  linkOnly('nasaGibs', 'NASA GIBS', '', ['journal']),
  linkOnly('protomaps', 'Protomaps', '', ['journal']),
];

type IsEnabled = (block: string) => boolean;

/** Worst first. */
const LEVEL_ORDER: readonly StatusLevel[] = ['down', 'degraded', 'maintenance', 'unknown', 'ok'];

const PROBLEM_LEVELS: readonly (StatusLevel | 'none')[] = ['down', 'degraded', 'maintenance'];

export function visibleStatusServices(services: readonly StatusService[], isEnabled: IsEnabled): StatusService[] {
  return services.filter(s => s.featureBlocks.some(isEnabled));
}

export function visibleParts(service: StatusService, isEnabled: IsEnabled): StatusPart[] {
  return service.parts.filter(p => !p.featureBlocks || p.featureBlocks.some(isEnabled));
}

/** The worst of the VISIBLE parts: a Matrix outage must not colour kring for a tenant without chat. */
export function serviceLevel(service: StatusService, status: ServiceStatus | undefined, isEnabled: IsEnabled): StatusLevel | 'none' {
  if (service.source === 'none') return 'none';
  const levels = visibleParts(service, isEnabled).map(p => status?.parts[p.label]?.level ?? 'unknown');
  return LEVEL_ORDER.find(level => levels.includes(level)) ?? 'unknown';
}

/** Problems first, worst on top; everything else keeps its order. `sort` is stable. */
export function sortByProblem(services: readonly StatusService[], result: ServiceStatusResult | undefined, isEnabled: IsEnabled): StatusService[] {
  const rank = (service: StatusService): number => {
    const index = PROBLEM_LEVELS.indexOf(serviceLevel(service, result?.services[service.id], isEnabled));
    return index === -1 ? PROBLEM_LEVELS.length : index;
  };
  return [...services].sort((a, b) => rank(a) - rank(b));
}

/** How many of these services report a problem or an unknown state. Link-only services count for neither. */
export function statusSummary(services: readonly StatusService[], result: ServiceStatusResult | undefined, isEnabled: IsEnabled): { problems: number; unknown: number } {
  const levels = services.map(s => serviceLevel(s, result?.services[s.id], isEnabled));
  return {
    problems: levels.filter(level => PROBLEM_LEVELS.includes(level)).length,
    unknown: levels.filter(level => level === 'unknown').length,
  };
}

/** One bar of the Better Stack history. `recovered` is a day that had an outage, so it is not green. */
export function dayLevel(status: string): StatusLevel {
  switch (status) {
    case 'operational': return 'ok';
    case 'recovered':
    case 'degraded': return 'degraded';
    case 'downtime': return 'down';
    case 'maintenance': return 'maintenance';
    default: return 'unknown';
  }
}
