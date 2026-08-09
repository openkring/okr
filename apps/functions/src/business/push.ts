// apps/functions/src/business/push.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

import { AppConfigCollection, UserCollection } from '@okr/shared-models';
import type { PartnerSegment, Roles } from '@okr/shared-models';
import { countBillableUsers } from '@okr/business-metering-util';
import type { CountableUser, MeteringPayload, MeteringPayloadRow } from '@okr/business-metering-util';

const REGION = 'europe-west6';

/**
 * C3 §3 — the sender half of the metering push, shipped **inside the product**.
 *
 * Every openkring installation carries this function; only one configured with `METERING_CONFIG`
 * actually reports. That is the point: every partner runs the same reviewed reporting code, so a
 * missing heartbeat is a breach by construction (C2 §13.3) rather than a poller bkaiser has to
 * operate, and no partner writes their own integration.
 *
 * The secret is one JSON blob rather than six params because it is one decision — "this
 * installation belongs to partner X" — and splitting it lets an installation end up half
 * configured, which pushes nothing while looking configured.
 */
export const meteringConfig = defineSecret('METERING_CONFIG');

interface TenantConfig {
  tenantId: string;
  segment: PartnerSegment;
  /** Store date (yyyymmdd) the tenant went live — contract data, not derivable from the data. */
  activationDate: string;
  /** Set only when the tenant came from the shared prospect pool (C5 §7). */
  prospectKey?: string;
  /** Overrides the `app-config` operator fields when the business contact is somebody else. */
  contact?: { name: string; role: string; email: string };
}

export interface MeteringConfig {
  partnerKey: string;
  /** The bkaiser `pushMetering` callable, e.g. `https://<region>-<project>.cloudfunctions.net/pushMetering`. */
  endpoint: string;
  /** The partner's service identity in the `kring` project — the uid on `partners.serviceUid`. */
  serviceEmail: string;
  servicePassword: string;
  /** Web API key of the `kring` project, needed to exchange the password for an ID token. */
  apiKey: string;
  tenants: TenantConfig[];
}

/**
 * The installation's partner identity, or `undefined` for the overwhelmingly common case of an
 * installation that is not a partner's. Shared with `pool-client.ts`: one secret, one decision —
 * "this installation belongs to partner X" — and everything that talks to bkaiser reads it here.
 */
export function readConfig(): MeteringConfig | undefined {
  const raw = meteringConfig.value();
  if (!raw) return undefined;
  try {
    const config = JSON.parse(raw) as MeteringConfig;
    if (!config.partnerKey || !config.endpoint || !Array.isArray(config.tenants)) {
      logger.error('pushMeteringToPlatform: METERING_CONFIG is incomplete — nothing pushed.');
      return undefined;
    }
    return config;
  } catch {
    logger.error('pushMeteringToPlatform: METERING_CONFIG is not valid JSON — nothing pushed.');
    return undefined;
  }
}

/**
 * The measurement runs on the **last day of the month** (pricing §9.1, rule 1) — a point in time,
 * not an average, and not a value that can be reproduced two days later. Cron cannot express
 * "last day", so the job runs late every evening and returns immediately unless tomorrow is the 1st.
 */
export const pushMeteringToPlatform = onSchedule(
  {
    region: REGION,
    schedule: '45 23 28-31 * *',
    timeZone: 'Europe/Zurich',
    secrets: [meteringConfig],
    retryCount: 3,
  },
  async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (tomorrow.getDate() !== 1) return;

    const config = readConfig();
    if (!config) return;   // not a partner installation — the overwhelmingly common case

    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const version = await installedVersion();

    const tenants: MeteringPayloadRow[] = [];
    for (const tenant of config.tenants) {
      tenants.push(await buildRow(tenant, version));
    }

    const payload: MeteringPayload = { partnerKey: config.partnerKey, period, tenants };
    const result = await callPlatform<PushResponse>(config, 'pushMetering', payload);
    logger.info(`pushMeteringToPlatform: ${period} — ${tenants.length} tenants pushed, ` +
      `${result.accepted} accepted, ${result.rejected?.length ?? 0} rejected`);
  },
);

/** One tenant's line: counts and add-ons measured here, contract data from the config. */
async function buildRow(tenant: TenantConfig, version: string): Promise<MeteringPayloadRow> {
  const db = getFirestore();
  const [users, configDoc] = await Promise.all([
    db.collection(UserCollection).where('tenants', 'array-contains', tenant.tenantId).get(),
    db.collection(AppConfigCollection).doc(tenant.tenantId).get(),
  ]);

  const disabled = await disabledUids();
  const countable: CountableUser[] = users.docs.map(doc => ({
    roles: (doc.get('roles') ?? {}) as Roles,
    isArchived: doc.get('isArchived') === true,
    disabled: disabled.has(doc.id),
  }));
  const counts = countBillableUsers(countable);

  return {
    tenantId: tenant.tenantId,
    customerName: configDoc.get('appName') ?? tenant.tenantId,
    segment: tenant.segment,
    totalUsers: counts.totalUsers,
    privilegedUsers: counts.privilegedUsers,
    // Add-ons are the tenant's enabled feature blocks; `ADD_ON_PRICES` prices the ones that are
    // billable and ignores the rest, so sending all of them is correct and needs no second list.
    addOns: (configDoc.get('enabledFeatures') ?? []) as string[],
    version,
    activationDate: tenant.activationDate ?? '',
    // Contact-of-record is a business-role contact, never member data (C2 §7) — the operator
    // fields of `app-config` are exactly that.
    contact: tenant.contact ?? {
      name: configDoc.get('opName') ?? '',
      role: 'operator',
      email: configDoc.get('opEmail') ?? '',
    },
    prospectKey: tenant.prospectKey ?? '',
  };
}

/**
 * Firebase Auth's `disabled` flag lives in Auth, not Firestore, so it takes a full user listing.
 * Done once per run and shared across tenants.
 */
let disabledCache: Set<string> | undefined;
async function disabledUids(): Promise<Set<string>> {
  if (disabledCache) return disabledCache;
  const uids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    page.users.filter(u => u.disabled).forEach(u => uids.add(u.uid));
    pageToken = page.pageToken;
  } while (pageToken);
  disabledCache = uids;
  return uids;
}

/** The running version, read from the `app-version` doc the release already maintains. */
async function installedVersion(): Promise<string> {
  const doc = await getFirestore().collection('app-version').doc('app-version').get();
  return (doc.get('version') ?? '') as string;
}

interface PushResponse {
  accepted: number;
  rejected?: { tenantId: string; reason: string }[];
}

/**
 * Call one of bkaiser's partner-facing callables over HTTPS with an ID token of the partner's
 * service identity. `pushMetering` uses it, and so does every pool call in `pool-client.ts`.
 *
 * Password sign-in via the REST API rather than a service-account key: the credential bkaiser hands
 * a partner has to be revocable by bkaiser alone, and a user in the `kring` project is (disable the
 * account and the pushes stop), whereas a key minted in the partner's own project is not.
 *
 * The sibling endpoints are derived from the configured `pushMetering` URL rather than configured
 * one by one: they are the same deployment, and a second URL in the secret is a second thing that
 * can be half-configured — the failure mode `MeteringConfig` exists to avoid.
 */
export async function callPlatform<T>(
  config: MeteringConfig, functionName: string, payload: unknown,
): Promise<T> {
  const endpoint = config.endpoint.replace(/pushMetering\/?$/, functionName);
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.serviceEmail, password: config.servicePassword, returnSecureToken: true,
      }),
    });
  if (!signIn.ok) {
    throw new Error(`metering sign-in failed: ${signIn.status} ${await signIn.text()}`);
  }
  const { idToken } = await signIn.json() as { idToken: string };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: payload }),
  });
  if (!response.ok) {
    // Thrown, not logged: `retryCount` retries the run, and a silent failure of `pushMetering` is
    // exactly the absent heartbeat that costs the partner their contract.
    throw new Error(`${functionName} failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json() as { result: T };
  return body.result;
}
