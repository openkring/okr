/**
 * Which device a Sentry event came from, and whether this build was ever meant to run on it.
 *
 * Sentry cannot answer that on its own here: across 30 days of iOS events in the `scs` project
 * the searchable `os.version` / `browser.version` fields are empty on EVERY row. The version
 * exists in the raw tag blob of some events (SCS-9V carried `os: iOS 18.7`) but never in a form
 * you can aggregate, alert on, or put in a dashboard. So we set our own tags.
 *
 * The build floor is not a policy we choose — it is whatever `browserslist` resolves to, which
 * decides how far the Angular/esbuild pipeline downlevels. Today that is:
 *
 *     ios_saf 26.5, 26.4, 26.3, 26.2, 18.5-18.7   (nothing below 18.5)
 *
 * i.e. an iPhone on iOS 17 gets untranspiled modern JS and may fail to parse a chunk at all.
 * Re-check with `npx browserslist` after an Angular major upgrade and update IOS_BUILD_FLOOR;
 * `browserslist` is not a direct dependency of this workspace, so no test can assert it for us.
 */

/** Lowest iOS version the shipped bundle is compiled for. See the module comment. */
export const IOS_BUILD_FLOOR = 18.5;

/**
 * APIs esbuild emits verbatim at the current target, keyed by the iOS version that introduced
 * them. A device missing one of these cannot run the bundle that contains it, whatever its UA
 * claims — which is the only signal that survives an iPad.
 *
 * `Promise.withResolvers` is not hypothetical: it is in five shipped chunks today (the pdf and
 * matrix-crypto ones). The rest are here as a graded scale, so a report says HOW far below the
 * floor a device is rather than just "below".
 */
const MODERN_API_PROBES: ReadonlyArray<{ name: string; since: string; supported: () => boolean }> = [
  { name: 'structuredClone', since: 'ios15.4', supported: () => hasFn(globalThis, 'structuredClone') },
  { name: 'Object.hasOwn', since: 'ios15.4', supported: () => hasFn(Object, 'hasOwn') },
  { name: 'Array.toSorted', since: 'ios16.4', supported: () => hasFn(Array.prototype, 'toSorted') },
  { name: 'Promise.withResolvers', since: 'ios17.4', supported: () => hasFn(Promise, 'withResolvers') },
  { name: 'Object.groupBy', since: 'ios17.4', supported: () => hasFn(Object, 'groupBy') },
];

/**
 * Is `key` a callable on `host`?
 *
 * Deliberately an indexed lookup rather than `typeof Promise.withResolvers`: the workspace
 * compiles against `lib: es2020`, so naming these APIs statically does not type-check — which is
 * the very fact being probed. Keep it this way; raising the lib to silence it would be fixing the
 * symptom and would let these APIs be *called* elsewhere without anyone noticing.
 */
function hasFn(host: unknown, key: string): boolean {
  return typeof (host as Record<string, unknown> | null | undefined)?.[key] === 'function';
}

/** Tags attached to every Sentry event. Values are strings — Sentry tags cannot hold anything else. */
export interface DeviceSupportTags {
  /** Parsed OS version, e.g. '18.7'. `unknown` when the UA does not carry one. */
  osVersion: string;
  /** Same value, but only ever set for iOS/iPadOS, so an alert rule needs no platform clause. */
  iosVersion?: string;
  /** 'true' | 'false' | 'unknown' — see `isBelowBuildFloor`. */
  belowBuildFloor: string;
  /** 'none', or a comma-separated list of probes that failed. Hard capability evidence. */
  missingModernApis: string;
}

/**
 * The iOS version out of a user-agent string, as a number ('18.7' → 18.7), or undefined.
 *
 * Returns undefined for iPadOS 13+, which reports a desktop `Macintosh` UA with no iOS version
 * in it at all. That is not a gap we can close: the OS deliberately hides it. It is also exactly
 * the device class most likely to be old, which is why `missingModernApis` exists — a probe sees
 * through the masquerade, a UA parse never can.
 */
export function parseIosVersion(userAgent: string): number | undefined {
  // "CPU iPhone OS 18_7 like Mac OS X" / "CPU OS 17_6_1 like Mac OS X"
  const match = /\b(?:iPhone )?OS (\d+)(?:_(\d+))?/.exec(userAgent);
  if (!match || !/iP(hone|od|ad)/i.test(userAgent)) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return undefined;
  return Number(`${major}.${minor}`);
}

/**
 * The OS version out of a user-agent string, for the platforms whose UA still carries one.
 *
 * Android and iOS do; desktop Safari/macOS has frozen its version at 10_15_7 for years and
 * Windows at "Windows NT 10.0", so reporting those would be noise dressed as data — they are
 * deliberately left unknown rather than reported wrong.
 */
export function parseOsVersion(userAgent: string): string | undefined {
  const ios = parseIosVersion(userAgent);
  if (ios !== undefined) return String(ios);
  const android = /\bAndroid (\d+(?:\.\d+)?)/.exec(userAgent);
  return android ? android[1] : undefined;
}

/**
 * Whether this device is below the build floor.
 *
 * Three-valued on purpose. A failed probe is proof ('true') and outranks the UA, because a
 * masquerading iPad reports no version while still missing the API. A UA version below the floor
 * is also proof. Everything else is 'unknown' rather than 'false' — we know the device is not
 * *provably* too old, which is a weaker claim than "supported", and an alert built on a silent
 * 'false' would be worse than none.
 */
export function isBelowBuildFloor(userAgent: string, missingApis: readonly string[]): string {
  if (missingApis.length > 0) return 'true';
  const ios = parseIosVersion(userAgent);
  if (ios === undefined) return 'unknown';
  return ios < IOS_BUILD_FLOOR ? 'true' : 'false';
}

/** Run the capability probes. Each is wrapped: a probe must never be the thing that breaks a boot. */
export function findMissingModernApis(): string[] {
  return MODERN_API_PROBES.filter((probe) => {
    try { return !probe.supported(); } catch { return true; }
  }).map((probe) => `${probe.name}@${probe.since}`);
}

/**
 * Build the device-support tags. Safe on the server and in any storage-denied context: it reads
 * `navigator.userAgent` and nothing else, and every probe is guarded.
 */
export function getDeviceSupportTags(userAgent?: string): DeviceSupportTags {
  const ua = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const missingApis = findMissingModernApis();
  const ios = parseIosVersion(ua);
  const osVersion = parseOsVersion(ua);
  return {
    osVersion: osVersion ?? 'unknown',
    ...(ios === undefined ? {} : { iosVersion: String(ios) }),
    belowBuildFloor: isBelowBuildFloor(ua, missingApis),
    missingModernApis: missingApis.length === 0 ? 'none' : missingApis.join(','),
  };
}
