import type { BundleId, FeatureBlock } from './feature-catalogue.types';

/**
 * Bundle catalogue — pure presentational grouping data for the feature picker UI (id,
 * i18n label key, icon). Lives here rather than in `@okr/tenant-routes` for the same
 * reason `FEATURE_BLOCKS` below does: it is plain data with zero Angular imports, so
 * anything that only needs bundle metadata (a Cloud Function report, the picker's util
 * layer) can depend on `@okr/tenant-util` alone.
 */
export const FEATURE_BUNDLES: { id: BundleId; label: string; icon: string }[] = [
  { id: 'core',          label: '@bundle.core.label',          icon: 'settings' },
  { id: 'members',       label: '@bundle.members.label',       icon: 'people' },
  { id: 'events',        label: '@bundle.events.label',        icon: 'calendar' },
  { id: 'finance',       label: '@bundle.finance.label',       icon: 'cash' },
  { id: 'documents',     label: '@bundle.documents.label',     icon: 'documents' },
  { id: 'communication', label: '@bundle.communication.label', icon: 'chatbubbles' },
  { id: 'special',       label: '@bundle.special.label',       icon: 'star' },
];

const calevent: FeatureBlock = {
  id: 'calevent',
  bundle: 'events',
  label: '@feature.calevent.label',
  icon: 'calendar',
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['calevents'],
  menu: [{
    key: 'calevent-all', name: 'calevent-all', url: '/calevent/all/c-calevents',
    action: 'navigate', roleNeeded: 'eventAdmin', icon: 'calendar', label: '@main.calevent.all',
  }],
};

const aoc: FeatureBlock = {
  id: 'aoc',
  bundle: 'special',
  label: '@feature.aoc.label',
  icon: 'admin',
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: [],
  menu: [{
    key: 'aoc-menu', name: 'aoc-menu', url: '', action: 'sub',
    roleNeeded: 'admin', icon: 'admin', label: 'AOC - Operation Centre',
    children: [
      { key: 'aoc-admin',      name: 'aoc-admin',      url: '/aoc/adminops',   action: 'navigate', roleNeeded: 'admin', icon: 'admin',    label: '@main.aoc.admin' },
      { key: 'aoc-auth',       name: 'aoc-auth',       url: '/aoc/roles',      action: 'navigate', roleNeeded: 'admin', icon: 'key',      label: '@main.aoc.auth' },
      { key: 'aoc-content',    name: 'aoc-content',    url: '/aoc/content',    action: 'navigate', roleNeeded: 'admin', icon: 'page',     label: 'Content' },
      { key: 'aoc-data',       name: 'aoc-data',       url: '/aoc/data',       action: 'navigate', roleNeeded: 'admin', icon: 'database', label: 'Daten' },
      { key: 'aoc-statistics', name: 'aoc-statistics', url: '/aoc/statistics', action: 'navigate', roleNeeded: 'admin', icon: 'chart',    label: 'Statistiken' },
      { key: 'aoc-storage',    name: 'aoc-storage',    url: '/aoc/storage',    action: 'navigate', roleNeeded: 'admin', icon: 'documents', label: 'Storage' },
    ],
  }],
};

/**
 * Every feature block's METADATA the platform ships. Adding a block here is HALF of what
 * makes a feature reachable — the matching Angular route fragment must also be added to
 * `FEATURE_ROUTES` in `@okr/tenant-routes` (`feature-catalogue.ts`), joined by `id`.
 * `feature-catalogue.sync.spec.ts` (in `@okr/tenant-routes`) fails CI if the two ever
 * drift apart; `feature-catalogue.spec.ts` fails if a declared menu url ships no route.
 * Tasks 12-18 fill in the remaining blocks, one bundle each; these two exist because they
 * are p13's bug.
 */
export const FEATURE_BLOCKS: FeatureBlock[] = [calevent, aoc];
