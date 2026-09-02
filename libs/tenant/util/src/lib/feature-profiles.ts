import type { FeatureBlock } from './feature-catalogue.types';
import { resolveWithDeps } from './feature-deps.util';

/**
 * A NAMED block selection — "what kind of tenant is this?" as a statement rather than as a
 * residue of whoever last ticked a checkbox.
 *
 * WHY THIS EXISTS. Reading the live `enabledFeatures` of the seven tenants (2026-09-02) shows
 * three obvious clusters — `elab` at 21 blocks, `p13`/`bkg` at 23, `scs`/`bka`/`okr`/`kring` at
 * 28-31 — that nobody ever named. Because they are unnamed, there is no place where "elab is a
 * minimal tenant" is written down, so every divergence from that idea is just a checkbox, never
 * a decision anyone can review. Naming them buys two things: provisioning a tenant becomes
 * reproducible, and `pnpm catalogue:check` can report "okr weicht in 2 Bloecken vom Profil ab"
 * instead of only ever comparing a tenant against itself.
 *
 * A PROFILE IS A SUGGESTION, NOT A CONSTRAINT. Nothing enforces it, no tenant is required to
 * match one, and applying one in the picker only ticks checkboxes — the admin still saves
 * through every existing gate (`removal_confirm`, the dry-run preview). Deliberately so: a
 * tenant that deviates on purpose is normal, and a profile that silently corrected such a
 * tenant would be the `enabledFeatures`-stripping failure mode all over again.
 *
 * NO TENANT→PROFILE MAP LIVES HERE. Which tenant "is" which profile is tenant policy, not
 * catalogue metadata, and hard-coding it would rot the moment a tenant buys another block.
 * `closestProfile` derives it instead, by distance.
 */
export interface FeatureProfile {
  /** Stable id, used in reports and (later) as a provisioning argument. */
  id: string;
  /** i18n key, resolved like every block/bundle label. */
  label: string;
  /** i18n key of the one-line "what you get" description. */
  description: string;
  icon: string;
  /**
   * The blocks this profile asks for. `core` blocks are NEVER listed — they are on for every
   * tenant regardless and would only add noise to every comparison. Dependencies need not be
   * listed either; `resolveWithDeps` closes over them wherever a profile is used.
   */
  blocks: string[];
}

/**
 * The three profiles, deliberately NESTED (`minimal` ⊂ `vereinsbetrieb` ⊂ `voll`).
 *
 * Nesting is what makes "distance from a profile" readable: without it, a tenant could sit
 * equally far from two profiles for opposite reasons and the number would say nothing. With it,
 * the distance decomposes into "how far up the chain" plus a short list of genuine extras.
 *
 * The sets were derived from what the seven live tenants actually run, then trimmed to what is
 * DEFENSIBLE as a starting point rather than transcribed: `elab` also has `activity` and
 * `alias`, but neither belongs in a minimal club — they show up as extras, which is the honest
 * reading.
 */
export const FEATURE_PROFILES: FeatureProfile[] = [
  {
    id: 'minimal',
    label: '@tenant/util.profile.minimal.label',
    description: '@tenant/util.profile.minimal.description',
    icon: 'person',
    // Personen, Termine, Dokumente, Aufgaben, Chat, Verwaltung. `subject` pulls `document`
    // and `task`, `calevent` pulls `subject`/`document`, `aoc` pulls `document` — all listed
    // anyway, so the set reads as itself rather than as something to resolve in your head.
    blocks: ['subject', 'calevent', 'document', 'task', 'chat', 'aoc'],
  },
  {
    id: 'vereinsbetrieb',
    label: '@tenant/util.profile.vereinsbetrieb.label',
    description: '@tenant/util.profile.vereinsbetrieb.description',
    icon: 'people',
    blocks: [
      'subject', 'calevent', 'document', 'task', 'chat', 'aoc',
      'relationship', 'resource', 'forms', 'meeting', 'activity',
    ],
  },
  {
    id: 'voll',
    label: '@tenant/util.profile.voll.label',
    description: '@tenant/util.profile.voll.description',
    icon: 'star',
    blocks: [
      'subject', 'calevent', 'document', 'task', 'chat', 'aoc',
      'relationship', 'resource', 'forms', 'meeting', 'activity',
      'finance', 'pdf-template', 'esign', 'trip', 'mobility', 'instruments', 'alias',
    ],
  },
];

export interface ProfileDeviation {
  /** Blocks the profile asks for that are NOT effective for this tenant. */
  missing: string[];
  /** Blocks effective for this tenant that the profile does not ask for. */
  extra: string[];
}

/**
 * How far a tenant's EFFECTIVE block set sits from a profile, in both directions.
 *
 * `core` blocks are excluded from both lists: they are on for every tenant no matter what, so
 * reporting them would make every tenant look like it deviates by thirteen. Dependencies are
 * closed over first — a profile that asks for `finance` implicitly asks for `pdf-template`, and
 * a tenant running it is not "extra".
 */
export function profileDeviation(
  catalogue: FeatureBlock[],
  profile: FeatureProfile,
  effective: Set<string>,
): ProfileDeviation {
  const expected = new Set(resolveWithDeps(catalogue, profile.blocks));
  const core = new Set(catalogue.filter(block => block.core === true).map(block => block.id));

  return {
    missing: [...expected].filter(id => !effective.has(id) && !core.has(id)).sort(),
    extra: [...effective].filter(id => !expected.has(id) && !core.has(id)).sort(),
  };
}

/**
 * The profile a tenant is nearest to, by total deviation — the answer to "what kind of tenant
 * is this?" derived rather than declared.
 *
 * Ties go to the EARLIER profile in `profiles`, which, given the nesting, means the smaller one.
 * That is the conservative reading: a tenant equidistant between `minimal` and `vereinsbetrieb`
 * is better described as "a minimal tenant with extras" than as "a club tenant missing half its
 * blocks", because the first phrasing does not imply anything is broken.
 */
export function closestProfile(
  catalogue: FeatureBlock[],
  profiles: FeatureProfile[],
  effective: Set<string>,
): { profile: FeatureProfile; deviation: ProfileDeviation } | undefined {
  let best: { profile: FeatureProfile; deviation: ProfileDeviation; distance: number } | undefined;

  for (const profile of profiles) {
    const deviation = profileDeviation(catalogue, profile, effective);
    const distance = deviation.missing.length + deviation.extra.length;
    if (best === undefined || distance < best.distance) best = { profile, deviation, distance };
  }
  return best ? { profile: best.profile, deviation: best.deviation } : undefined;
}
