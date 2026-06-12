import { Roles } from '@bk2/shared-models';

import { VCARD_MAX_TARGETS, VcardCapability } from './vcard-types';

/**
 * The export tier a set of roles grants. Mirrors the app's role hierarchy
 * (see `hasRole` in `@bk2/shared-util-core`): `admin` satisfies every tier.
 */
export type VcardTier = 'none' | 'registered' | 'privileged' | 'memberAdmin';

/**
 * Map a `Roles` flag object to the highest export tier it grants.
 * `admin` implies all tiers; the order below is highest-first.
 */
export function vcardTier(roles: Roles | undefined): VcardTier {
  if (!roles) return 'none';
  if (roles.admin === true || roles.memberAdmin === true) return 'memberAdmin';
  if (roles.privileged === true) return 'privileged';
  // any role that `hasRole('registered', …)` would accept
  if (
    roles.registered === true ||
    roles.contentAdmin === true ||
    roles.resourceAdmin === true ||
    roles.eventAdmin === true ||
    roles.treasurer === true
  ) {
    return 'registered';
  }
  return 'none';
}

/**
 * Decide, given the caller's roles and the number of selected targets, what the
 * user may export (spec §4). Pure — used identically on the client (to show the
 * action and decide whether to prompt) and in the callable (defence in depth).
 */
export function resolveVcardCapability(roles: Roles | undefined, selectionCount: number): VcardCapability {
  switch (vcardTier(roles)) {
    case 'memberAdmin':
      return {
        allowed: selectionCount > 0 && selectionCount <= VCARD_MAX_TARGETS,
        maxTargets: VCARD_MAX_TARGETS,
        scope: 'full',
        promptForScope: true,
      };
    case 'privileged':
      return { allowed: selectionCount > 0 && selectionCount <= 1, maxTargets: 1, scope: 'full', promptForScope: true };
    case 'registered':
      return { allowed: selectionCount > 0 && selectionCount <= 1, maxTargets: 1, scope: 'favorites', promptForScope: false };
    default:
      return { allowed: false, maxTargets: 0, scope: 'favorites', promptForScope: false };
  }
}
