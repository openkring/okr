import type { Route } from '@angular/router';
import { isAdminGuard, isAuthenticatedGuard, isPrivilegedGuard } from '@okr/auth-feature';

/**
 * A feature block's Angular ROUTE fragment — `canActivate` guards + `loadComponent`. Split
 * out of `@okr/tenant-util`'s `FeatureBlock` (metadata only) because blocks eagerly import
 * `isAdminGuard`/`isAuthenticatedGuard` from `@okr/auth-feature`, which pulls in
 * `@angular/core` (`inject`) and `@okr/shared-feature`'s `AppStore` (an NgRx Signal Store).
 * `apps/functions` needs the metadata but must never import this: confirmed empirically —
 * adding `FEATURE_CATALOGUE` (the old, unsplit export) to the Cloud Functions build grew
 * `dist/apps/functions/main.cjs` from 3.9MB to 15MB and shipped live `@angular/core`
 * symbols into the Node runtime (task-8 report).
 *
 * Joined to `FEATURE_BLOCKS` (`@okr/tenant-util`) by `id`. `feature-catalogue.sync.spec.ts`
 * fails CI if the two arrays ever drift apart; `feature-catalogue.spec.ts` (route-coverage)
 * fails if a menu url declared in `FEATURE_BLOCKS` resolves against no route here.
 */
export interface BlockRoutes {
  /** Joins to `FeatureBlock.id` in `@okr/tenant-util`'s `FEATURE_BLOCKS`. */
  id: string;
  /** Lazy route fragment this block owns. Called only when composing the table. */
  routes: () => Route[];
}

const calevent: BlockRoutes = {
  id: 'calevent',
  routes: (): Route[] => [
    {
      path: 'calevent',
      canActivate: [isAuthenticatedGuard],
      children: [{
        // No privileged guard: every authenticated member must reach the event list.
        // CalEventList gates create/edit/delete itself via canChange().
        path: ':listId/:contextMenuName',
        loadComponent: () => import('@okr/calevent-feature').then(m => m.CalEventList),
        data: { color: 'secondary', view: 'grid', showMenu: true },
      }],
    },
    // Owns only ITS OWN child of the shared 'public' path (task 12 review round 2: this
    // fragment used to live verbatim inside the always-on `cms` block, which meant a
    // tenant with `calevent` switched off would still ship `/public/calendar` rendering
    // `CalEventList` once Task 19 drives the real route table from this catalogue — the
    // enablement gate bypassed through a core block, and calevent-feature never actually
    // droppable from the bundle. Same precedent as `profile` owning only its own child of
    // the shared 'person' path.
    {
      path: 'public',
      children: [{
        path: 'calendar',
        loadComponent: () => import('@okr/calevent-feature').then(m => m.CalEventList),
        data: { listId: 'public', view: 'list', showMenu: false },
      }],
    },
  ],
};

const aoc: BlockRoutes = {
  id: 'aoc',
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
};

const auth: BlockRoutes = {
  id: 'auth',
  routes: (): Route[] => [{
    path: 'auth',
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', loadComponent: () => import('@okr/auth-feature').then(m => m.LoginPage) },
      { path: 'logout', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@okr/auth-feature').then(m => m.LogoutPage) },
      { path: 'pwdreset', loadComponent: () => import('@okr/auth-feature').then(m => m.PasswordResetPage) },
      { path: 'confirm', loadComponent: () => import('@okr/auth-feature').then(m => m.ConfirmPasswordResetPage) },
    ],
  }],
};

const cms: BlockRoutes = {
  id: 'cms',
  routes: (): Route[] => [
    {
      // 'calendar' deliberately NOT here — it moved to calevent's own 'public' fragment
      // (task 12 review round 2). See the comment there for why.
      path: 'public',
      children: [
        {
          path: 'news',
          loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageDispatcher),
          data: { id: 'news', showMenu: false },
        },
        {
          path: ':id/:contextMenuName',
          loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageDispatcher),
          data: { color: 'secondary' },
        },
        {
          path: ':id',
          loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageDispatcher),
          data: { color: 'secondary' },
        },
      ],
    },
    {
      path: 'private',
      canActivate: [isAuthenticatedGuard],
      children: [
        {
          path: ':id/:contextMenuName',
          loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageDispatcher),
          data: { color: 'secondary' },
        },
        {
          path: ':id',
          loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageDispatcher),
          data: { color: 'secondary' },
        },
      ],
    },
    {
      path: 'page',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageList) },
      ],
    },
    {
      path: 'section',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/cms-section-feature').then(m => m.SectionAllList) },
      ],
    },
    {
      path: 'menu',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/cms-menu-feature').then(m => m.MenuList) },
      ],
    },
    {
      path: 'icon',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/cms-icon-feature').then(m => m.IconList) }],
    },
  ],
};

const user: BlockRoutes = {
  id: 'user',
  routes: (): Route[] => [{
    path: 'user',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/user-feature').then(m => m.UserList) },
      // Corrected from app.routes.ts's uncalled `isAdminGuard` (one of the 12 sites where
      // the live route table writes the guard factory uncalled, which enforces nothing —
      // see feature-catalogue.types.ts / the task brief).
      { path: ':userKey', canActivate: [isAdminGuard()], loadComponent: () => import('@okr/user-feature').then(m => m.UserEditPage) },
    ],
  }],
};

const profile: BlockRoutes = {
  id: 'profile',
  routes: (): Route[] => [{
    // Shares the 'person' top-level path with the `subject` block's own route fragment
    // (task 13) — only the 'profile' child belongs to this block. composeFeatureRoutes
    // just concatenates fragments for route-coverage matching, so two blocks each owning a
    // 'person' fragment is safe; it is never used to assemble the real app.routes.ts.
    path: 'person',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'profile', loadComponent: () => import('@okr/profile-feature').then(m => m.ProfileEditPage), data: { preload: true } },
    ],
  }],
};

const session: BlockRoutes = {
  id: 'session',
  routes: (): Route[] => [],
};

const security: BlockRoutes = {
  id: 'security',
  routes: (): Route[] => [{
    // Privacy 1.19 Phase 5C/5D — the Bearbeitungsverzeichnis and the privacy audit.
    // Admin-only: both disclose the tenant's full processing landscape.
    path: 'security',
    // Corrected from app.routes.ts's uncalled `isAdminGuard` at this and the three
    // `canActivate` sites below (4 of the 12 uncalled-guard sites live in this one fragment).
    canActivate: [isAdminGuard()],
    children: [
      {
        path: 'register',
        canActivate: [isAdminGuard()],
        loadComponent: () => import('@okr/security-processing-feature').then(m => m.ProcessingRegisterPage),
      },
      {
        path: 'register/:key',
        canActivate: [isAdminGuard()],
        loadComponent: () => import('@okr/security-processing-feature').then(m => m.ProcessingActivityPage),
      },
      {
        path: 'privacy-audit',
        canActivate: [isAdminGuard()],
        loadComponent: () => import('@okr/security-audit-feature').then(m => m.PrivacyAuditPage),
      },
    ],
  }],
};

const i18n: BlockRoutes = {
  id: 'i18n',
  routes: (): Route[] => [{
    path: 'i18n',
    // Corrected from app.routes.ts's uncalled `isAdminGuard` (both this and the 'defaults'
    // child below).
    canActivate: [isAdminGuard()],
    children: [
      {
        path: 'defaults',
        canActivate: [isAdminGuard()],
        loadComponent: () => import('@okr/i18n-feature').then(m => m.I18nDefaultList),
      },
      {
        path: 'overrides',
        canActivate: [isPrivilegedGuard],
        loadComponent: () => import('@okr/i18n-feature').then(m => m.I18nOverrideList),
      },
    ],
  }],
};

const avatar: BlockRoutes = {
  id: 'avatar',
  routes: (): Route[] => [],
};

const category: BlockRoutes = {
  id: 'category',
  routes: (): Route[] => [{
    path: 'category',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/category-feature').then(m => m.CategoryList) },
    ],
  }],
};

const comment: BlockRoutes = {
  id: 'comment',
  routes: (): Route[] => [],
};

const geo: BlockRoutes = {
  id: 'geo',
  routes: (): Route[] => [
    {
      path: 'location',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/location-feature').then(m => m.LocationList) }],
    },
    {
      path: 'trips',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/trip-feature').then(m => m.TripList) }],
    },
  ],
};

const consent: BlockRoutes = {
  id: 'consent',
  routes: (): Route[] => [],
};

const subject: BlockRoutes = {
  id: 'subject',
  routes: (): Route[] => [
    {
      // Shares the 'person' top-level path with the (core-catalogued) `profile` block's own
      // route fragment — only the ':listId/:contextMenuName' and ':personKey' children
      // belong to this block; 'profile' belongs to `profile`. `composeFeatureRoutes` just
      // concatenates fragments for route-coverage matching (see `profile`'s comment in the
      // core bundle), so two blocks each owning a 'person' fragment is safe.
      path: 'person',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: ':listId/:contextMenuName', loadComponent: () => import('@okr/subject-person-feature').then(m => m.PersonList) },
        { path: ':personKey', loadComponent: () => import('@okr/subject-person-feature').then(m => m.PersonEditPage) },
      ],
    },
    {
      path: 'org',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/subject-org-feature').then(m => m.OrgList) }],
    },
    {
      path: 'group-view',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':groupKey', loadComponent: () => import('@okr/subject-group-feature').then(m => m.GroupViewPage) }],
    },
    {
      path: 'group',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: ':listId/:contextMenuName', loadComponent: () => import('@okr/subject-group-feature').then(m => m.GroupList) },
        { path: ':groupKey', loadComponent: () => import('@okr/subject-group-feature').then(m => m.GroupViewPage) },
      ],
    },
    {
      path: 'address',
      canActivate: [isAuthenticatedGuard],
      children: [{
        path: ':contextMenuName',
        // Corrected from app.routes.ts's uncalled `isAdminGuard` (task 13; one of the 12
        // uncalled-guard sites the core bundle's report catalogued, the last one not yet
        // owned by a landed block).
        canActivate: [isAdminGuard()],
        loadComponent: () => import('@okr/subject-address-feature').then(m => m.AddressesList),
      }],
    },
    {
      path: 'applications',
      canActivate: [isPrivilegedGuard],
      loadComponent: () => import('@okr/application-feature').then(m => m.ApplicationList),
    },
  ],
};

const relationship: BlockRoutes = {
  id: 'relationship',
  routes: (): Route[] => [
    {
      path: 'contact',
      canActivate: [isAuthenticatedGuard],
      children: [{
        path: ':listId/:orgId/:contextMenuName',
        loadComponent: () => import('@okr/relationship-membership-feature').then(m => m.MembershipList),
        data: { color: 'secondary', view: 'contact' },
      }],
    },
    {
      path: 'membership',
      canActivate: [isAuthenticatedGuard],
      children: [{
        path: ':listId/:orgId/:contextMenuName',
        loadComponent: () => import('@okr/relationship-membership-feature').then(m => m.MembershipList),
        data: { color: 'secondary', view: 'mcat' },
      }],
    },
    {
      path: 'scsmemberfees',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':contextMenuName', loadComponent: () => import('@okr/relationship-membership-feature').then(m => m.ScsMemberFees) }],
    },
    {
      path: 'invitation',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-invitation-feature').then(m => m.InvitationList) }],
    },
    {
      path: 'ownership',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-ownership-feature').then(m => m.OwnershipList) }],
    },
    {
      path: 'reservation',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-reservation-feature').then(m => m.ReservationList) }],
    },
    {
      path: 'personalrel',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-personal-rel-feature').then(m => m.PersonalRelList) }],
    },
    {
      path: 'workrel',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-workrel-feature').then(m => m.WorkrelList) }],
    },
    {
      path: 'transfer',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-transfer-feature').then(m => m.TransferList) }],
    },
    {
      path: 'responsibility',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/relationship-responsibility-feature').then(m => m.ResponsibilityList) }],
    },
  ],
};

const vcard: BlockRoutes = {
  // No route — `VcardExportScopeModal` is invoked from an ActionSheet, never routed to.
  id: 'vcard',
  routes: (): Route[] => [],
};

/**
 * Every feature block's Angular route fragment. Adding a block here is HALF of what makes
 * a feature reachable — the matching metadata (id, dependsOn, bundle, menu, seed) must
 * also be added to `FEATURE_BLOCKS` in `@okr/tenant-util`. Tasks 12-18 fill in the
 * remaining blocks, one bundle each; these two exist because they are p13's bug.
 */
export const FEATURE_ROUTES: BlockRoutes[] = [
  calevent, aoc,
  auth, cms, user, profile, session, security, i18n, avatar, category, comment, geo, consent,
  subject, relationship, vcard,
];
