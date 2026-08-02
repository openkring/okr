import type { Route } from '@angular/router';
import { isAdminGuard } from '@okr/auth-feature';
import { isAuthenticatedGuard } from '@okr/auth-feature';
import type { BundleId, FeatureBlock } from '@okr/tenant-util';

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
  dependsOn: ['person'],
  collections: ['calevents'],
  routes: (): Route[] => [{
    path: 'calevent',
    canActivate: [isAuthenticatedGuard],
    children: [{
      // No privileged guard: every authenticated member must reach the event list.
      // CalEventList gates create/edit/delete itself via canChange().
      path: ':listId/:contextMenuName',
      loadComponent: () => import('@okr/calevent-feature').then(m => m.CalEventList),
      data: { color: 'secondary', view: 'grid', showMenu: true },
    }],
  }],
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
  routes: (): Route[] => [{
    path: 'aoc',
    canActivate: [isAdminGuard()],
    children: [
      { path: 'adminops',   loadComponent: () => import('@okr/aoc-feature').then(m => m.AocAdminOps) },
      { path: 'roles',      loadComponent: () => import('@okr/aoc-feature').then(m => m.AocRoles) },
      { path: 'content',    loadComponent: () => import('@okr/aoc-feature').then(m => m.AocContent) },
      { path: 'data',       loadComponent: () => import('@okr/aoc-feature').then(m => m.AocData) },
      { path: 'statistics', loadComponent: () => import('@okr/aoc-feature').then(m => m.AocStatistics) },
      { path: 'storage',    loadComponent: () => import('@okr/aoc-feature').then(m => m.AocStorage) },
    ],
  }],
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
 * Every feature block the platform ships. Adding a block here is the ONLY way to make a
 * feature reachable — the route-coverage test fails if a declared url ships no route.
 * Tasks 12-18 fill in the remaining blocks, one bundle each; these two exist because
 * they are p13's bug.
 */
export const FEATURE_CATALOGUE: FeatureBlock[] = [calevent, aoc];
