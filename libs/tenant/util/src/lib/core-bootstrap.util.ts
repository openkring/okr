import type { FeatureBlock } from './feature-catalogue.types';

/**
 * The core blocks a tenant's first feature save must seed (spec 1.165 follow-up).
 *
 * Core blocks (`core: true`: auth, profile, aoc, cms, …) have no switch in the picker, so the
 * picker never sends an `enableBlock` for them — their menu documents (login, logout, profile,
 * the AOC and CMS menus) were only ever seeded for the tenants that existed when the catalogue
 * was introduced. A tenant provisioned later got a sidebar without login, profile or AOC.
 *
 * Rule: a tenant whose STORED `enabledFeatures` holds no core block at all has never been
 * bootstrapped — it gets every core block. A tenant that stores any core block is established and
 * is left alone: several (scs, p13, …) deliberately lack `vcard`, and re-seeding would add rows
 * they removed. A legacy doc without the field reads as "every block" and is left alone too.
 */
export function coreBootstrapBlocks(catalogue: FeatureBlock[], stored: string[] | undefined): FeatureBlock[] {
  if (!Array.isArray(stored)) return [];
  const core = catalogue.filter(b => b.core === true);
  return core.some(b => stored.includes(b.id)) ? [] : core;
}
