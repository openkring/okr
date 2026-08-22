import { getFirestore } from 'firebase-admin/firestore';

import { AppConfigCollection } from '@okr/shared-models';

/**
 * Host ↔ Tenant, abgeleitet aus `AppConfig.appDomain`.
 *
 * Die Spec verweist für den Resolver auf „dieselbe Domain→Tenant-Karte wie main.ts". **Die gibt
 * es nicht** — `main.ts` und `publicApi/index.ts` führen je eine CORS-*Origin*-Allowlist ohne
 * jede Tenant-Zuordnung. Eine dritte, handgepflegte Liste anzulegen wäre die schlechteste der
 * Möglichkeiten: sie müsste bei jedem neuen Tenant nachgeführt werden und würde es nicht.
 *
 * `appDomain` steht dagegen schon im `app-config` jedes Tenants und wird beim Provisionieren
 * gesetzt. Ein einziger Read baut daraus beide Richtungen; das Ergebnis wird für die Lebensdauer
 * der Function-Instanz gehalten, weil vor jedem Redirect ein Roundtrip zählt.
 */
interface DomainMap {
  /** Hostname (lowercase, ohne Port) → tenantId. */
  readonly byHost: ReadonlyMap<string, string>;
  /** tenantId → Origin der App, ohne Slash am Ende. */
  readonly baseUrlByTenant: ReadonlyMap<string, string>;
}

let cached: DomainMap | undefined;

/** Nur für Tests — erzwingt einen frischen Read. */
export function resetDomainMapCache(): void {
  cached = undefined;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().split(':')[0];
}

async function loadDomainMap(): Promise<DomainMap> {
  const snap = await getFirestore().collection(AppConfigCollection).get();
  const byHost = new Map<string, string>();
  const baseUrlByTenant = new Map<string, string>();

  for (const doc of snap.docs) {
    const tenantId = doc.id;
    const appDomain = normalizeHost(String(doc.data()['appDomain'] ?? ''));
    if (!appDomain) continue;

    // Die App liegt auf `app.<domain>`, die Website auf der Apex (siehe dns-Skill). Beide
    // Formen dürfen einen Kurzlink tragen — ein QR-Code auf Papier nennt oft die kürzere.
    byHost.set(appDomain, tenantId);
    byHost.set(`app.${appDomain}`, tenantId);
    byHost.set(`www.${appDomain}`, tenantId);
    baseUrlByTenant.set(tenantId, `https://app.${appDomain}`);
  }
  return { byHost, baseUrlByTenant };
}

async function domainMap(): Promise<DomainMap> {
  cached ??= await loadDomainMap();
  return cached;
}

/** Welcher Tenant wird unter diesem Host angesprochen? `undefined` = unbekannt → 404. */
export async function tenantByHost(host: string): Promise<string | undefined> {
  return (await domainMap()).byHost.get(normalizeHost(host));
}

/** Origin der Tenant-App, ohne Slash am Ende — Basis für Kurz- und Ziel-URLs. */
export async function appBaseUrl(tenantId: string): Promise<string> {
  const url = (await domainMap()).baseUrlByTenant.get(tenantId);
  if (!url) {
    throw new Error(`Tenant '${tenantId}' has no appDomain in its app-config.`);
  }
  return url;
}

/** Die Kurz-URL eines Alias. NICHT die Ziel-URL — die baut `buildTargetUrl`. */
export function shortUrl(baseUrl: string, space: string, alias: string): string {
  return `${baseUrl}/s/${space}/${alias}`;
}
