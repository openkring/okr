import type { Availability, FeatureBlock, FeatureRollout } from './feature-catalogue.types';
import { resolveWithDeps } from './feature-deps.util';

export interface AvailabilityVerdict {
  offered: boolean;
  availability: Availability;
  /** Operator-authored explanation, shown in the picker when `offered` is false. */
  reason: string;
}

export interface EffectiveFeaturesInput {
  catalogue: FeatureBlock[];
  rollouts: FeatureRollout[];
  /** `undefined` = legacy app-config doc with no field yet (D-BB-10). */
  enabled: string[] | undefined;
  tenantId: string;
}

/**
 * Decide whether a block may be offered to a tenant. Resolution order is fixed:
 * deny-list, then the doc's availability (or the catalogue default when no doc exists),
 * then the allow-list for the staged tiers.
 */
export function resolveAvailability(
  block: FeatureBlock,
  rollout: FeatureRollout | undefined,
  tenantId: string,
): AvailabilityVerdict {
  const availability = rollout?.availability ?? block.defaultAvailability;
  const reason = rollout?.reason ?? '';

  if (rollout?.denyTenants?.includes(tenantId)) {
    return { offered: false, availability, reason };
  }
  if (availability === 'disabled') {
    return { offered: false, availability, reason };
  }
  if (availability === 'internal' || availability === 'beta') {
    const allowed = rollout?.allowTenants?.includes(tenantId) ?? false;
    return { offered: allowed, availability, reason };
  }
  return { offered: true, availability, reason };
}

/**
 * catalogue ∩ rollout ∩ enablement (D-BB-3).
 * Core blocks bypass enablement but NOT rollout — a broken core block must still be
 * killable. An undefined `enabled` means a legacy config doc: default to every
 * non-internal block so an existing tenant's menu does not blank on first deploy.
 */
export function effectiveFeatures(input: EffectiveFeaturesInput): Set<string> {
  const { catalogue, rollouts, enabled, tenantId } = input;
  const rolloutById = new Map(rollouts.map(r => [r.okey, r]));

  const requested = enabled === undefined
    ? catalogue.filter(b => b.defaultAvailability !== 'internal').map(b => b.id)
    : enabled;

  const withDeps = new Set(resolveWithDeps(catalogue, requested));
  const out = new Set<string>();

  for (const block of catalogue) {
    const wanted = block.core === true || withDeps.has(block.id);
    if (!wanted) continue;
    if (!resolveAvailability(block, rolloutById.get(block.id), tenantId).offered) continue;
    out.add(block.id);
  }
  return out;
}
