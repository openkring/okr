import type { Route } from '@angular/router';
import { isAdminGuard, isAuthenticatedGuard, isContentAdminGuard, isPrivilegedGuard, isTreasurerGuard } from '@okr/auth-feature';

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
        // No `view` here: route `data` outranks query params in Angular's input binder
        // ({...queryParams, ...params, ...data}), so a `data.view` would make menu urls
        // like `/calevent/all/c-calevents?view=list` impossible. 'grid' is the input default.
        data: { color: 'secondary', showMenu: true },
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
    // Added (task 14 reconciliation): app.routes.ts's third `calevent-feature` route, missed
    // when this block was first catalogued (task 5 copied only the list route). Same
    // `calevents` collection as `CalEventList` — no new collection.
    {
      path: 'yearlyevents',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/calevent-feature').then(m => m.YearlyEvents) }],
    },
  ],
};

/**
 * RECONCILED (task 18) against every `aoc` child in `app.routes.ts:388-408`. Task 5 copied
 * SIX of them; the live app declares SIXTEEN. The ten added here — `chat`, `account`,
 * `sessions`, `doc`, `tag`, `email`, `bexio`, `srv`, `trip`, `website` — were unreachable
 * through the catalogue, which matters concretely for SIX of them: `aoc-sessions`,
 * `aoc-chat`, `aoc-account`, `aoc-doc`, `aoc-bexio` and `aoc-srv` are live children of the
 * shared `aoc-menu` doc (they are now catalogued as menu specs on the `aoc` block too), so
 * before this the seeded submenu could point at routes this table did not have. The other
 * four (`tag`, `email`, `trip`, `website`) were simply unrouted here: `tag` and `website` do
 * have live docs, but under `cms-menu` rather than `aoc-menu` (see the `aoc` block in
 * `feature-blocks.ts`), and `email`/`trip` have no menu doc at all.
 *
 * GUARD: `app.routes.ts:389` has `canActivate: [isAdminGuard]` — the factory UNCALLED, i.e.
 * the whole `/aoc/*` admin console is open to any authenticated user in the live app today.
 * Written CALLED here, and that correction stands for every screen below.
 *
 * WHERE THE ADMIN GATE NOW SITS, AND WHY IT MOVED (owner ruling, 2026-08-05). The ruling
 * softens `aoc/website` and `/aoc/srv` to match their menu documents (`aoc-website` and
 * `aoc-srv`, both `roleNeeded: contentAdmin`). Softening those two children ALONE would have
 * changed nothing: Angular evaluates an ancestor's `canActivate` before activating any
 * descendant, so the parent `isAdminGuard()` would still have bounced every non-admin before
 * the child guard ran. The gate therefore moved DOWN — the parent keeps only the floor every
 * `/aoc` screen shares, and each child the ruling does not touch carries its own
 * `isAdminGuard()`. Effective access for those children is byte-for-byte what it was; only its
 * expression changed. (That first pass made the floor `isPrivilegedGuard` and left FOURTEEN
 * admin children; ruling R-5, below, superseded both numbers — read on before relying on this
 * paragraph.)
 *
 * Two alternatives were considered and rejected. (1) Weakening the parent WITHOUT re-gating
 * the children would relax fourteen genuinely admin-only screens — roles, user accounts,
 * storage, data — to `privileged`, which is not what was ruled. (2) Splitting `/aoc` into two
 * sibling fragments (one admin, one privileged) would lean on the router backtracking to a
 * later sibling when a child fails to match, while a FAILED GUARD does not backtrack at all —
 * a subtle dependency on recognizer behaviour for no benefit over an explicit per-child guard.
 *
 * WHAT THE FLOOR IS, AFTER RULING R-5 (2026-08-05). R-5 added `isContentAdminGuard` and put it
 * on `aoc/website`, `/aoc/srv` and `/aoc/tag`, so the parent's floor had to change again: an
 * `isPrivilegedGuard` floor is `hasRole('privileged')` → `['privileged', 'admin']`, which does
 * NOT admit `contentAdmin` and would have bounced exactly the users R-5 exists to let in —
 * the same defeat-by-ancestor as softening the children alone.
 *
 * The floor is now `isContentAdminGuard()`, and that is not a guess: it is the UNION of what
 * the children require. Fourteen require `admin` (`['admin']`); three require `contentAdmin`
 * (`['contentAdmin', 'admin']`). The union is `['contentAdmin', 'admin']`, i.e. exactly
 * `hasRole('contentAdmin')`. No `/aoc` child admits `privileged` any more (the one that did,
 * `website`, is now contentAdmin-gated), so nothing is locked out by it. Dropping the floor to
 * `isAuthenticatedGuard` instead was considered and rejected: it would be equally correct while
 * every child stays guarded, but it makes a forgotten child guard mean "open to any logged-in
 * member" rather than "still contentAdmin-only" — the tightest floor that satisfies the ruling
 * is the one that fails safest.
 *
 * Ruling R-6 (same day) swapped seven MORE routes to `isContentAdminGuard()`, but none of them
 * is under `/aoc` — so the union above is unchanged and this floor still holds.
 *
 * ⚠️ CONSEQUENCE: a child added here without a `canActivate` inherits the FLOOR
 * (`contentAdmin`), not `admin`. `feature-catalogue.guards.spec.ts` fails if any `/aoc` child
 * lacks its own guard, or if any child outside the three R-5 names is reachable by a non-admin
 * — do not delete that test, it is the whole safety net of this arrangement.
 *
 * `trip` LOADS ANOTHER BLOCK'S FEATURE LIB — `@okr/trip-feature` is `libs/geo/trip/feature`,
 * i.e. the `geo` block's, and `AocTrip` has no counterpart in `@okr/aoc-feature` (there is no
 * `aoc-trip.ts`). It is kept here rather than moved to `geo` and this is the INVERSE of the
 * Task 12 defect, not a repeat of it: that rule ("a `core: true` block must not own a route
 * that loads another block's feature lib") exists because a core block's route bypasses the
 * enablement gate of the lib it loads. Here the OWNER (`aoc`) is gated and the TARGET (`geo`)
 * is `core: true`, hence always effective — so nothing is bypassed in either direction, and
 * the screen is an AOC admin screen sitting under aoc's own admin path. Moving it to `geo`
 * would instead put a child of aoc's admin path into an always-on block.
 */
const aoc: BlockRoutes = {
  id: 'aoc',
  routes: (): Route[] => [{
    path: 'aoc',
    // The FLOOR every `/aoc` screen shares — the union of the children's own requirements, NOT
    // the admin gate. The admin gate lives on the fourteen children below that the 2026-08-05
    // rulings do not name. See the block comment for why it is contentAdmin and not privileged
    // (R-5) nor merely authenticated.
    canActivate: [isContentAdminGuard()],
    children: [
      { path: 'adminops',   canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocAdminOps) },
      { path: 'roles',      canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocRoles) },
      { path: 'content',    canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocContent) },
      { path: 'data',       canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocData) },
      { path: 'chat',       canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocChat) },
      { path: 'account',    canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocUserAccounts) },
      { path: 'statistics', canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocStatistics) },
      { path: 'storage',    canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocStorage) },
      { path: 'doc',        canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocDoc) },
      { path: 'kiosk',      canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocKiosk) },
      // SOFTENED by owner ruling R-5, 2026-08-05, to match the live `tag-all` menu doc's
      // `roleNeeded: contentAdmin`. The fifth mismatch, found while applying the first four and
      // explicitly folded into the ruling.
      { path: 'tag',        canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocTag) },
      { path: 'email',      canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocEmail) },
      { path: 'bexio',      canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocBexio) },
      // SOFTENED by owner ruling R-5, 2026-08-05, to match the live `aoc-srv` menu doc's
      // `roleNeeded: contentAdmin`. Written out even though it currently equals the parent's
      // floor: every `/aoc` child states its own requirement, so the spec can fail on a missing
      // one and so this fragment survives a future change to the floor unchanged.
      { path: 'srv',        canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocSrv) },
      { path: 'sessions',   canActivate: [isAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocSession) },
      // See the block comment: `@okr/trip-feature` is `geo`'s lib, deliberately.
      { path: 'trip',       canActivate: [isAdminGuard()], loadComponent: () => import('@okr/trip-feature').then(m => m.AocTrip) },
      // SOFTENED by owner ruling R-5, 2026-08-05, to match the live `aoc-website` menu doc's
      // `roleNeeded: contentAdmin`. This is the one place the live `app.routes.ts` guard is NOT
      // reproduced verbatim: it writes `isPrivilegedGuard`, which was inert under the old admin
      // parent and — per R-5 — is the wrong role for this screen either way.
      { path: 'website',    canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/aoc-feature').then(m => m.AocWebsite) },
    ],
  },
  // Workflow rules (spec 1.35). A TOP-LEVEL fragment, not an `/aoc` child, because the
  // screen is a standard list + edit modal from `@okr/system-workflow-feature` rather than
  // an AOC console panel — but it is contributed by THIS block because its menu row lives
  // in the AOC submenu and `system` is not a block of its own (see NON_BLOCK_DOMAINS: the
  // rule ENGINE is a Cloud Function that cannot be gated). Same owner-vs-target split as
  // `aoc/trip` above, in the same direction: aoc owns the entry point, another lib ships
  // the screen.
  {
    path: 'workflow/:listId/:contextMenuName',
    canActivate: [isAdminGuard()],
    loadComponent: () => import('@okr/system-workflow-feature').then(m => m.WorkflowRuleList),
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
        // ACCESS REDUCED by owner ruling R-6, 2026-08-05 — this is not a tidy-up. The route now
        // matches the `page-all` menu doc's `roleNeeded: contentAdmin`, and a `privileged`-only
        // user LOSES access to the page editor they can open today: `privileged` and
        // `contentAdmin` are disjoint apart from `admin` (`hasRole` maps each to
        // `[<role>, 'admin']`), so this swap admits contentAdmins and excludes privileged. The
        // owner was offered a union guard that would have kept both and chose the swap
        // deliberately: privileged was never meant to do CMS work.
        { path: ':listId/:contextMenuName', canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/cms-page-feature').then(m => m.PageList) },
      ],
    },
    {
      path: 'section',
      canActivate: [isAuthenticatedGuard],
      children: [
        // ACCESS REDUCED by owner ruling R-6, 2026-08-05: matches the `section-all` menu doc's
        // `roleNeeded: contentAdmin`, and a `privileged`-only user loses access to the section
        // list. See the `page` fragment above for the full rationale.
        { path: 'all', canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/cms-section-feature').then(m => m.SectionAllList) },
      ],
    },
    {
      path: 'menu',
      canActivate: [isAuthenticatedGuard],
      children: [
        // ACCESS REDUCED by owner ruling R-6, 2026-08-05: matches the `menu-all` menu doc's
        // `roleNeeded: contentAdmin`, and a `privileged`-only user loses access to the menu
        // editor. See the `page` fragment above for the full rationale.
        { path: 'all', canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/cms-menu-feature').then(m => m.MenuList) },
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
      // ACCESS REDUCED by owner ruling R-6, 2026-08-05: the route now matches the
      // `category-all` menu doc's `roleNeeded: contentAdmin`, and a `privileged`-only user
      // LOSES access to the category admin screen — `privileged` and `contentAdmin` are
      // disjoint apart from `admin`. The owner chose this swap over a union guard deliberately;
      // see the `page` fragment in the `cms` block for the full rationale.
      { path: ':listId/:contextMenuName', canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/category-feature').then(m => m.CategoryList) },
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
      // ACCESS REDUCED by owner ruling R-6, 2026-08-05: the child now matches the
      // `location-all` menu doc's `roleNeeded: contentAdmin`, and a `privileged`-only user
      // LOSES access to the locations admin screen — `privileged` and `contentAdmin` are
      // disjoint apart from `admin`. The owner chose this swap over a union guard deliberately;
      // see the `page` fragment in the `cms` block for the full rationale.
      children: [{ path: ':listId/:contextMenuName', canActivate: [isContentAdminGuard()], loadComponent: () => import('@okr/location-feature').then(m => m.LocationList) }],
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
      // Route ships to every tenant enabling `relationship` (copied verbatim from
      // app.routes.ts, no tenant gating in the route table itself), but the live menu is
      // deliberately NOT modelled: `scsf_memberfees` (nav, /scsmemberfees/c-scsfees) and its
      // wrapper `c-scsfees` (roleNeeded treasurer, children scsfees-reload/-export/-totals/
      // -archive) exist on the `scs` tenant only and `ScsMemberFees` is an SCS-bespoke
      // screen (fee-schedule import tied to that tenant's own billing setup) — same
      // tenant-bespoke-content exclusion as `member-menu`/`membership-menu` above, just
      // silent there before this fix (fix round 1, review). The route stays cheap to ship
      // (lazy-loaded, unreachable without a menu entry or typed URL); only the menu is
      // excluded.
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

const resource: BlockRoutes = {
  id: 'resource',
  routes: (): Route[] => [
    {
      path: 'resource',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: ':listId/:contextMenuName', loadComponent: () => import('@okr/resource-feature').then(m => m.ResourceList) },
      ],
    },
    {
      path: 'rboat',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/resource-feature').then(m => m.RowingBoatList) }],
    },
    {
      path: 'locker',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/resource-feature').then(m => m.LockerList) }],
    },
    {
      path: 'key',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/resource-feature').then(m => m.KeyList) }],
    },
  ],
};

const mobility: BlockRoutes = {
  id: 'mobility',
  routes: (): Route[] => [{
    path: 'flighttracker',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () => import('@okr/mobility-flighttracker-feature').then(m => m.FlightTrackerSearch),
  }],
};

/**
 * Four top-level paths, all copied verbatim from `app.routes.ts`. `scsmemberfees` sits
 * between `expense` and `accounting` in the live file but belongs to `relationship` (already
 * catalogued above), and `invoice-aging` sits between `icon` and `scsmemberfees`.
 *
 * `isTreasurerGuard` (on `accounting-ocr-rules`) is a plain `CanActivateFn`, NOT a factory —
 * it stays UNCALLED, like `isAuthenticatedGuard`/`isPrivilegedGuard`. Only `isAdminGuard`,
 * `isAuditorGuard` and `isContentAdminGuard` (added by ruling R-5) are `(): CanActivateFn`
 * factories that must be written called.
 */
const finance: BlockRoutes = {
  id: 'finance',
  routes: (): Route[] => [
    {
      // No live `menuItems` doc points at this screen (verified twice: no doc named
      // `invoice-aging`, and no doc whose `url` equals `/invoice-aging` or `invoice-aging`).
      // Reachable today only by typing the URL — same "un-menu'd admin screen" shape as
      // `i18n` and `applications`, not a route defect.
      path: 'invoice-aging',
      canActivate: [isAuthenticatedGuard],
      loadComponent: () => import('@okr/finance-invoice-feature').then(m => m.InvoiceAging),
    },
    {
      path: 'expense',
      canActivate: [isAuthenticatedGuard],
      children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/finance-expense-feature').then(m => m.ExpenseList) }],
    },
    {
      // A member's OWN invoices. The whole `accounting/:accountingTenantId` subtree below is
      // `isPrivilegedGuard`, so the `invoice-my` menu item (roleNeeded: 'registered', url
      // `/accounting/scs/invoice/my/c-invoice`) dead-ended for every plain member. This is the
      // same screen, authenticated-only, with `listId` pinned to 'my' by route data rather than
      // a param — so a member cannot type their way to the `all` list. `AccountingShell` is
      // reused verbatim: it only maps `:accountingTenantId` into the root AccountingStore.
      // Reads are already permitted — `invoices` is `tenantRead` in firestore.rules — and
      // InvoiceList's own `canChange()`/`canDelete()` keep edit/delete at treasurer/admin.
      path: 'my-invoice/:accountingTenantId',
      canActivate: [isAuthenticatedGuard],
      loadComponent: () => import('@okr/finance-accounting-feature').then(m => m.AccountingShell),
      children: [{
        path: ':contextMenuName',
        data: { listId: 'my' },
        loadComponent: () => import('@okr/finance-invoice-feature').then(m => m.InvoiceList),
      }],
    },
    {
      // `:accountingTenantId` is the LEGAL ENTITY whose books are shown (scs, gss, ...), not
      // the okr tenant — which is why every live navigate entry into this subtree is
      // necessarily tenant-authored and therefore excluded from the `finance` block's menu.
      // See the block comment in `@okr/tenant-util`'s `feature-blocks.ts`.
      path: 'accounting/:accountingTenantId',
      canActivate: [isPrivilegedGuard],
      loadComponent: () => import('@okr/finance-accounting-feature').then(m => m.AccountingShell),
      children: [
        {
          path: 'journal',
          children: [{ path: ':contextMenuName', loadComponent: () => import('@okr/finance-booking-feature').then(m => m.BookingList) }],
        },
        {
          path: 'invoice',
          children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/finance-invoice-feature').then(m => m.InvoiceList) }],
        },
        {
          path: 'bill',
          children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/finance-bill-feature').then(m => m.BillList) }],
        },
        {
          path: 'account',
          children: [{ path: ':contextMenuName', loadComponent: () => import('@okr/finance-account-feature').then(m => m.AccountList) }],
        },
        {
          path: 'periods',
          loadComponent: () => import('@okr/finance-period-feature').then(m => m.PeriodList),
        },
        {
          // No live `menuItems` doc navigates here (verified: no `/accounting/scs/vat-codes`
          // or `/accounting/gss/vat-codes` url, no `vat-codes`/`c-vat-codes` name) — the VAT
          // code list is reachable only by typed URL today.
          path: 'vat-codes',
          loadComponent: () => import('@okr/finance-vat-code-feature').then(m => m.VatCodeList),
        },
        {
          path: 'balance',
          loadComponent: () => import('@okr/finance-reporting-feature').then(m => m.BalanceSheetPage),
        },
        {
          path: 'income-statement',
          loadComponent: () => import('@okr/finance-reporting-feature').then(m => m.IncomeStatementPage),
        },
        {
          path: 'cash-flow',
          loadComponent: () => import('@okr/finance-reporting-feature').then(m => m.CashFlowPage),
        },
        {
          path: 'assets',
          loadComponent: () => import('@okr/finance-asset-feature').then(m => m.AssetList),
        },
        {
          path: 'depreciation-run',
          loadComponent: () => import('@okr/finance-asset-feature').then(m => m.DepreciationRunPage),
        },
        {
          path: 'payments',
          loadComponent: () => import('@okr/finance-payment-feature').then(m => m.PaymentOrderList),
        },
        {
          path: 'payments/:orderKey',
          loadComponent: () => import('@okr/finance-payment-feature').then(m => m.PaymentOrderDetailPage),
        },
        {
          // Copied verbatim INCLUDING the dead target: `journal-context` is not the name of
          // any live `menuItems` document (verified by two independent query shapes — see the
          // `finance` block comment in `feature-blocks.ts`). Landing on bare
          // `/accounting/<tid>` therefore renders BookingList with an empty context menu; the
          // working live entries navigate to `journal/c-journal` instead. Reported, not
          // "fixed" here — inventing a route or a menu doc is out of scope for a cataloguing
          // task, and changing the redirect target is an app-routes change.
          path: '',
          pathMatch: 'full',
          redirectTo: 'journal/journal-context',
        },
      ],
    },
    {
      path: 'accounting-ocr-rules/:accountingTenantId/:contextMenuName',
      canActivate: [isTreasurerGuard],
      loadComponent: () => import('@okr/finance-ocr-rule-feature').then(m => m.OcrRuleList),
    },
  ],
};

const esign: BlockRoutes = {
  id: 'esign',
  routes: (): Route[] => [{
    path: 'esign',
    // ACCESS REDUCED by owner ruling R-6, 2026-08-05: the route now matches the `esign` menu
    // doc's `roleNeeded: contentAdmin`, and a `privileged`-only user LOSES access to the
    // e-signature screen — `privileged` and `contentAdmin` are disjoint apart from `admin`. The
    // owner chose this swap over a union guard deliberately; see the `page` fragment in the
    // `cms` block for the full rationale. The guard sits on the top-level fragment here (the
    // block has a single, empty-path child), so this one line is the whole gate.
    canActivate: [isContentAdminGuard()],
    children: [
      {
        path: '',
        loadComponent: () => import('@okr/esign-feature').then(m => m.EsignList),
      },
    ],
  }],
};

const pdfTemplate: BlockRoutes = {
  id: 'pdf-template',
  routes: (): Route[] => [{
    path: 'templates',
    // Corrected from app.routes.ts:411's uncalled `isAdminGuard` — the factory written
    // uncalled enforces NOTHING, so `/templates` (and its `:templateKey` editor) is currently
    // open to any authenticated user in the live app. Same correction class as `user`,
    // `security`, `i18n` and `subject`'s `address` fragment.
    //
    // SOFTENED by owner ruling, 2026-08-05: the live `templates` menu doc declares
    // `roleNeeded: contentAdmin` for both `/templates` and `/templates/:templateKey`, and the
    // menu documents are the better record of who was meant to have access — under a called
    // `isAdminGuard()` a contentAdmin sees the row and the navigation silently cancels.
    // Ruling R-5 (same day) replaced the first pass's `isPrivilegedGuard` with
    // `isContentAdminGuard()`: privileged resolves to `['privileged', 'admin']` and so never
    // admitted the very role the menu doc names. FACTORY — must be written CALLED.
    canActivate: [isContentAdminGuard()],
    children: [
      {
        path: '',
        loadComponent: () => import('@okr/pdf-template-feature').then(m => m.TemplateList),
      },
      {
        path: ':templateKey',
        loadComponent: () => import('@okr/pdf-template-feature').then(m => m.TemplateEditPage),
      },
    ],
  }],
};

/**
 * The single `document` top-level path, copied verbatim from `app.routes.ts` (including its
 * `data` payload). The parent's `isAuthenticatedGuard` is a plain `CanActivateFn`, correctly
 * written uncalled here exactly as the live file has it.
 *
 * The child's guard was the FIRST instance of the menu-vs-route mismatch to be written down —
 * `isPrivilegedGuard` where the live `document-all` menu doc says `roleNeeded: contentAdmin` —
 * and was reported rather than changed at the time, because weakening a guard inside a
 * cataloguing task was out of bounds. Ruling R-6 (2026-08-05) closed it; see the guard itself.
 */
const documentBlock: BlockRoutes = {
  id: 'document',
  routes: (): Route[] => [{
    path: 'document',
    canActivate: [isAuthenticatedGuard],
    children: [
      // ACCESS REDUCED by owner ruling R-6, 2026-08-05: the route now matches the
      // `document-all` menu doc's `roleNeeded: contentAdmin`, and a `privileged`-only user
      // LOSES access to the document list — `privileged` and `contentAdmin` are disjoint apart
      // from `admin`. The owner chose this swap over a union guard deliberately; see the `page`
      // fragment in the `cms` block for the full rationale.
      { path: ':listId/:contextMenuName',
        canActivate: [isContentAdminGuard()],
        loadComponent: () => import('@okr/document-feature').then(m => m.DocumentList),
        data: { color: 'secondary', view: 'list', showMenu: true },
      },
    ],
  }],
};

/*
 * `folder` HAD AN ENTRY HERE (an empty one) UNTIL 2026-08-04, when the repo owner ruled the
 * block merged into `document`. It is gone rather than emptied: `feature-catalogue.sync.spec.ts`
 * fails if an id exists on one side of the catalogue only, so a leftover entry here would go
 * red the moment the block disappeared from `FEATURE_BLOCKS`. The domain itself still exists —
 * `libs/folder/**` is untouched, and `libs/folder/feature` is why `folder` now appears in
 * `NON_BLOCK_DOMAINS`. Nothing was lost by dropping the fragment: `app.routes.ts` contains no
 * `folder` path (grepped for both the path and every `@okr/folder-*` import), and `FolderList`,
 * the domain's only list screen, is exported from `@okr/folder-feature` but imported by no
 * component anywhere in `libs/` or `apps/`. Folders are navigated through `DocumentList`'s
 * breadcrumb, which belongs to the `document` block above.
 */

/**
 * No route fragment — deliberate, and verified rather than assumed: `app.routes.ts` has no
 * `chat` path and imports no `@okr/chat-*` lib anywhere. The chat SCREEN is a CMS page — the
 * live `chat` menu doc navigates to `/private/chat/contextMenuChat`, which resolves against
 * the `cms` block's `private/:id/:contextMenuName` fragment above and renders
 * `PageDispatcher` → `ChatPage` (`@case ('chat')`, `page.dispatcher.ts:53`) → `MatrixChat`.
 * The empty entry is still required: `feature-catalogue.sync.spec.ts` fails if an id exists
 * on one side only.
 *
 * CONSEQUENCE WORTH KNOWING before Task 19 drives the real route table from this catalogue:
 * because the chat screen rides on a `core: true` block's route, disabling `chat` will remove
 * its menu rows but NOT make `/private/chat/...` unreachable — a typed URL (or an existing
 * deep link) still renders the chat page, and `MatrixInitializationService` is started
 * unconditionally from `app.config.ts`'s bootstrap listener regardless of block selection.
 * Reported, not "fixed": gating either of those is an app change, not a cataloguing change.
 */
const chat: BlockRoutes = {
  id: 'chat',
  routes: (): Route[] => [],
};

/**
 * No route fragment. `app.routes.ts` has no `feed`/`social` path and imports no
 * `@okr/social-feed-*` lib; the domain's own `social-feed.routes.ts` (`/feed` →
 * `SocialFeedList`) is exported from `@okr/social-feed-feature` but registered by no
 * application, and nothing anywhere outside `libs/social-feed` imports the domain at all.
 * Deliberately NOT lifted into this table: copying that unused fragment here would invent a
 * route the app does not have, and would make a `localhost`-backed stub reachable. See the
 * block comment in `@okr/tenant-util`'s `feature-blocks.ts`.
 */
const socialFeed: BlockRoutes = {
  id: 'social-feed',
  routes: (): Route[] => [],
};

/**
 * The single `forms` top-level path, copied verbatim from `app.routes.ts:291-297` apart from
 * the one permitted guard correction.
 *
 * GUARD CORRECTED: app.routes.ts:293 writes `canActivate: [isAdminGuard]` — the factory
 * UNCALLED, which enforces nothing, so `/forms/:listId/:contextMenuName` (the whole form
 * builder, including every form definition's field config and encryption setup) is open to
 * any authenticated user in the live app today. The correction (a real guard where there was
 * none) stands; only its STRENGTH changed.
 *
 * SOFTENED by owner ruling, 2026-08-05, to match the live `forms-all` menu doc's
 * `roleNeeded: contentAdmin` — the menu documents are the better record of who was meant to
 * have access, and under a called `isAdminGuard()` a contentAdmin sees the row and the
 * navigation silently cancels. Ruling R-5 (same day) replaced the first pass's
 * `isPrivilegedGuard` with `isContentAdminGuard()`: privileged resolves to
 * `['privileged', 'admin']` and so never admitted the very role the menu doc names.
 * FACTORY — must be written CALLED.
 */
const forms: BlockRoutes = {
  id: 'forms',
  routes: (): Route[] => [{
    path: 'forms',
    canActivate: [isContentAdminGuard()],
    children: [
      { path: ':listId/:contextMenuName', loadComponent: () => import('@okr/forms-feature').then(m => m.FormDefinitionList) },
    ],
  }],
};

/**
 * The single `activity` top-level path, copied from `app.routes.ts:286-290` apart from the
 * one permitted guard correction. No `:contextMenuName` segment — `ActivityList` renders no
 * context menu at all (verified: no `contextMenuName`/`menuName` binding anywhere under
 * `libs/activity`), so no wrapper doc is owed.
 *
 * GUARD CORRECTED: `app.routes.ts:288` writes `canActivate: [isAdminGuard]` — the factory
 * UNCALLED, which enforces nothing, so `/activity` (the whole tenant's audit trail: who
 * changed which person, membership, invoice or document, and when) is readable by any
 * authenticated user in the live app today. Written called here. Same correction class as
 * `user`, `security`, `i18n`, `subject`'s `address` fragment, `pdf-template` and `forms`.
 */
const activity: BlockRoutes = {
  id: 'activity',
  routes: (): Route[] => [{
    path: 'activity',
    canActivate: [isAdminGuard()],
    loadComponent: () => import('@okr/activity-feature').then(m => m.ActivityList),
  }],
};

/**
 * The single `task` top-level path, copied VERBATIM from `app.routes.ts:260-264` — no guard
 * correction was needed or made. Note the deliberate asymmetry with most list routes: only
 * `isAuthenticatedGuard` on the parent and NO privileged guard on the child, because every
 * member must reach their own todo list (`task-my` → `/task/my/c-tasks`, `roleNeeded:
 * registered`). `TaskList` gates create/edit itself. Same shape and same reason as
 * `calevent`'s list route.
 */
const task: BlockRoutes = {
  id: 'task',
  routes: (): Route[] => [{
    path: 'task',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', loadComponent: () => import('@okr/task-feature').then(m => m.TaskList), data: { color: 'secondary' } }],
  }],
};

/**
 * TWO top-level paths, both copied verbatim from `app.routes.ts:265-281`: `whiteboard`
 * (`libs/instruments/whiteboard`) and `instruments` (`libs/instruments`). One block for both,
 * per the container-level granularity ruling — the same "several top-level paths, one block"
 * shape as `resource` and `finance`.
 *
 * NO GUARD CORRECTION: every guard here is a plain `CanActivateFn` (`isAuthenticatedGuard`,
 * `isPrivilegedGuard`), correctly uncalled in the source. Neither path uses `isAdminGuard`.
 *
 * BOTH `:contextMenuName` SEGMENTS ARE DEAD TODAY — reported, not invented around. The two
 * list routes take a `:contextMenuName` parameter and `WhiteboardList` renders `<okr-menu
 * [menuName]="contextMenuName()">` from it (`whiteboard-list.ts:46`), but NO live `menuItems`
 * doc named `c-instruments`/`c-whiteboards` (or anything else instrument- or whiteboard-
 * related) exists — verified with two query shapes per the `c-yearlyevents` lesson: a
 * name-equality `IN` query over the plausible names returned zero hits, and an ordered range
 * scan of every doc whose `name` sorts in [`c-i`, `c-z`) returned 26 docs, none of them
 * instruments'. There is also no `navigate` doc pointing at either path, so nothing reaches
 * these screens through a menu at all today. Inventing the wrappers would violate the
 * mirror-verbatim rule; the block therefore ships `menu: []` and the gap is stated on the
 * block in `feature-blocks.ts`.
 */
const instruments: BlockRoutes = {
  id: 'instruments',
  routes: (): Route[] => [
    {
      path: 'whiteboard',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/instruments-whiteboard-feature').then(m => m.WhiteboardList), data: { color: 'secondary' } },
        { path: ':whiteboardKey', loadComponent: () => import('@okr/instruments-whiteboard-feature').then(m => m.WhiteboardEditorPage) },
      ],
    },
    {
      path: 'instruments',
      canActivate: [isAuthenticatedGuard],
      children: [
        { path: 'board/:instrumentKey', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/instruments-feature').then(m => m.InstrumentPage), data: { color: 'secondary' } },
        { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@okr/instruments-feature').then(m => m.InstrumentList), data: { color: 'secondary' } },
      ],
    },
  ],
};

/**
 * The single `quiz` top-level path, copied verbatim from `app.routes.ts:52-56`. No guard
 * correction needed (`isAuthenticatedGuard` is a plain `CanActivateFn`). `libs/games/quiz` is
 * the domain's only subdomain and `QuizPage` its only screen — see the block comment in
 * `feature-blocks.ts` for what that screen actually contains.
 *
 * THE FRAGMENT STAYS EVEN THOUGH THE BLOCK IS `defaultAvailability: 'disabled'` (repo owner's
 * ruling, 2026-08-04). Disabling is not deleting: the route is what the catalogue would compose
 * if the block were ever raised again by a `feature-rollout/games` doc, and emptying it would
 * throw that away for no gain. The ruling only bites once task 19 composes the app's table PER
 * BLOCK with `isFeatureEnabledGuard(block.id)` prepended to each fragment's `canActivate` —
 * `composeFeatureRoutes` alone flat-maps every fragment in unconditionally, so catalogue-driving
 * by itself would leave `/quiz` live. See the `games` block comment in `feature-blocks.ts` for
 * why static pre-filtering is not an alternative.
 */
const games: BlockRoutes = {
  id: 'games',
  routes: (): Route[] => [{
    path: 'quiz',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () => import('@okr/games-quiz-feature').then(m => m.QuizPage),
  }],
};

/**
 * The partner channel (spec 1.25 / C3 §5). `isAdminGuard` because the registry carries each
 * partner's contractual status and the `serviceUid` their installation reports with — an
 * operator-grade screen, not a member-facing one. `kring-app` also declares this route by hand
 * (it does not compose the catalogue yet); the two must stay identical.
 */
const business: BlockRoutes = {
  id: 'business',
  routes: (): Route[] => [
    {
      path: 'partner',
      canActivate: [isAdminGuard()],
      children: [
        { path: ':listId/:contextMenuName', canActivate: [isAdminGuard()], loadComponent: () => import('@okr/business-partner-feature').then(m => m.PartnerList) },
      ],
    },
    // No `:contextMenuName`: the ledger has exactly one action (run the commission), and it is a
    // toolbar button. A context menu would mean a menu doc in Firestore per tenant for one entry.
    {
      path: 'metering',
      canActivate: [isAdminGuard()],
      loadComponent: () => import('@okr/business-metering-feature').then(m => m.MeteringList),
    },
    // The lead pool (spec 1.30 / C5). Same block, not a second one: it is the same back office,
    // and a partner reaches the pool through callables rather than through any route here.
    // No `:contextMenuName` either — one action (revoke consent), reached from the row.
    {
      path: 'prospect',
      canActivate: [isAdminGuard()],
      loadComponent: () => import('@okr/business-prospect-feature').then(m => m.ProspectList),
    },
    // The 3LS escalation queue (spec 1.29 / C4). Still the same block: it is the same back office,
    // and a partner reaches the queue through callables rather than through any route here.
    // `:listId` partitions by status ('all' is the whole queue); the detail view is a page because
    // an escalation is worked over days and linked to by URL.
    {
      path: 'ticket',
      canActivate: [isAdminGuard()],
      children: [
        { path: ':listId', canActivate: [isAdminGuard()], loadComponent: () => import('@okr/business-ticket-feature').then(m => m.TicketList) },
        { path: 'detail/:ticketKey', canActivate: [isAdminGuard()], loadComponent: () => import('@okr/business-ticket-feature').then(m => m.TicketPage) },
      ],
    },
  ],
};

/**
 * Every feature block's Angular route fragment. Adding a block here is HALF of what makes
 * a feature reachable — the matching metadata (id, dependsOn, bundle, menu, seed) must
 * also be added to `FEATURE_BLOCKS` in `@okr/tenant-util`. Tasks 12-18 filled in the
 * blocks, one bundle each; the first two exist because they are p13's bug.
 */
export const FEATURE_ROUTES: BlockRoutes[] = [
  calevent, aoc, activity, task, instruments, games,
  auth, cms, user, profile, session, security, i18n, avatar, category, comment, geo, consent,
  subject, relationship, vcard,
  resource, mobility,
  finance, esign, pdfTemplate,
  documentBlock,
  chat, socialFeed, forms,
  business,
];
