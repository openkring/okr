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
  /**
   * The partner's service identity in the `kring` project — the account on `partners.serviceUid`.
   * Not used to authenticate (see `serviceRefreshToken`); kept because a log line naming a uid is
   * unreadable and every diagnosis of this path starts with "which identity was that?".
   */
  serviceEmail: string;
  /**
   * A Firebase **refresh token** for that identity, minted once by bkaiser and handed over with the
   * rest of this secret. Replaced the password on 2026-08-09 — see `callPlatform` for why the
   * password could not work at all.
   */
  serviceRefreshToken: string;
  /** Web API key of the `kring` project, needed to exchange the refresh token for an ID token. */
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
    if (!config.serviceRefreshToken) {
      // Checked by name rather than left to fail at the exchange: a config still carrying the
      // pre-2026-08-09 `servicePassword` parses fine, looks configured, and then dies one layer
      // down with an opaque token error. Say which field is missing, once, here.
      logger.error('pushMeteringToPlatform: METERING_CONFIG has no serviceRefreshToken. ' +
        'The password was replaced by a refresh token on 2026-08-09 (App Check enforces ' +
        'identitytoolkit; see callPlatform) — re-mint the secret.');
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

/**
 * The running version, read from the `app-version` doc the release already maintains.
 *
 * Exported because bkaiser's own installation IS the current openkring release, which makes this
 * the supported-version window's reference point in `ticket.ts` (C4 §3) as well as the version a
 * partner reports here. One doc, one meaning — a second "current version" constant is a second
 * thing that goes stale on release day.
 */
export async function installedVersion(): Promise<string> {
  const doc = await getFirestore().collection('app-version').doc('app-version').get();
  // `latestVersion` is the field the release actually maintains; `version` was never written by any
  // release and read empty, which silently sent every ticket into the §3 window gate with no version.
  return (doc.get('latestVersion') ?? doc.get('version') ?? '') as string;
}

interface PushResponse {
  accepted: number;
  rejected?: { tenantId: string; reason: string }[];
}

/**
 * Exchange the configured refresh token for a short-lived Firebase ID token.
 *
 * **Why not `signInWithPassword`, which this used until 2026-08-09.** App Check is `ENFORCED` on
 * `identitytoolkit.googleapis.com` for this project, and App Check attests *client apps* — a Cloud
 * Function has no attestation to obtain, so it has no token to present. Every sign-in endpoint there
 * (`signInWithPassword`, `signInWithCustomToken`, `signUp`) therefore answers
 * `401 "Firebase App Check token is invalid."` **before** it looks at the credential, which is why
 * minting a custom token instead does not help either. `securetoken.googleapis.com` is a different
 * service and is not enforced — verified against the live project, where an invalid refresh token
 * gets past the gate and fails as `400 INVALID_REFRESH_TOKEN`.
 *
 * **Revocability is what §3 cared about, and it is stronger here than with a password.** A refresh
 * token dies three ways, all of them bkaiser's alone: `revokeRefreshTokens(uid)`, disabling the
 * account, and a password change. The one-time mint still needs an attested client, so it happens
 * once per partner at provisioning — where the password used to be handed over — and enforcement
 * stays fully on for the login form.
 *
 * No caching. One extra round trip per platform call, on a path used monthly (`pushMetering`) or by
 * a human pressing a button; a cached token would buy nothing and add a stale-credential failure
 * mode across warm instances.
 */
export async function idTokenFor(config: MeteringConfig): Promise<string> {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${config.apiKey}`, {
    method: 'POST',
    // Form-encoded, which is the documented shape for this endpoint.
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: config.serviceRefreshToken,
    }),
  });
  if (!response.ok) {
    throw new Error(`token exchange failed for ${config.serviceEmail}: ${response.status} ${await response.text()}`);
  }
  // The endpoint answers snake_case to a form-encoded request and camelCase to a JSON one. Both are
  // read rather than assumed: picking the wrong one yields `undefined`, which then travels onward as
  // the string "Bearer undefined" and fails as an auth error three layers away from its cause.
  const body = await response.json() as { id_token?: string; idToken?: string };
  const idToken = body.id_token ?? body.idToken;
  if (!idToken) throw new Error(`token exchange for ${config.serviceEmail} returned no id_token`);
  return idToken;
}

/**
 * Call one of bkaiser's partner-facing callables over HTTPS with an ID token of the partner's
 * service identity. `pushMetering` uses it, every pool call in `pool-client.ts` does, and so does
 * every escalation call in `ticket-client.ts`.
 *
 * The sibling endpoints are derived from the configured `pushMetering` URL rather than configured
 * one by one: they are the same deployment, and a second URL in the secret is a second thing that
 * can be half-configured — the failure mode `MeteringConfig` exists to avoid.
 */
export async function callPlatform<T>(
  config: MeteringConfig, functionName: string, payload: unknown,
): Promise<T> {
  const endpoint = config.endpoint.replace(/pushMetering\/?$/, functionName);
  const idToken = await idTokenFor(config);

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
