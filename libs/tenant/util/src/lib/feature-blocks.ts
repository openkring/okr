import type { BundleId, FeatureBlock, MenuSpec } from './feature-catalogue.types';

/**
 * Bundle catalogue — pure presentational grouping data for the feature picker UI (id,
 * i18n label key, icon). Lives here rather than in `@okr/tenant-routes` for the same
 * reason `FEATURE_BLOCKS` below does: it is plain data with zero Angular imports, so
 * anything that only needs bundle metadata (a Cloud Function report, the picker's util
 * layer) can depend on `@okr/tenant-util` alone.
 */
// Keys are scoped to `@okr/tenant-util`'s own i18n scope (`libs/tenant/util/src/i18n/de.json`,
// synced to `assets/i18n/tenant/util/`) — the PFX MUST be 'tenant/util.', matching the lib's
// full physical path, not a bare 'tenant.'/'bundle.'/'feature.' prefix (that 404s silently;
// see `feature-picker-i18n.ts` and `libs/security/audit/util`'s `PFX` for the verified
// pattern this mirrors).
export const FEATURE_BUNDLES: { id: BundleId; label: string; icon: string }[] = [
  { id: 'core',          label: '@tenant/util.bundle.core.label',          icon: 'settings' },
  { id: 'members',       label: '@tenant/util.bundle.members.label',       icon: 'people' },
  { id: 'events',        label: '@tenant/util.bundle.events.label',        icon: 'calendar' },
  { id: 'finance',       label: '@tenant/util.bundle.finance.label',       icon: 'cash' },
  { id: 'documents',     label: '@tenant/util.bundle.documents.label',     icon: 'documents' },
  { id: 'communication', label: '@tenant/util.bundle.communication.label', icon: 'chatbubbles' },
  { id: 'special',       label: '@tenant/util.bundle.special.label',       icon: 'star' },
];

/**
 * `cms-menu` and `aoc-menu` are live, genuinely SHARED parent `menuItems` docs (verified
 * against Firestore, task 12 review round 2) — `cms-menu`'s own `children[]` lists entries
 * owned by `cms`, `category`, `geo`, AND several not-yet-catalogued domains (document,
 * forms, esign, pdf-template, …); `aoc-menu`'s lists entries owned by `aoc`, `user`,
 * `security`, AND two not-yet-catalogued domains (activity, mobility — see the TODO on the
 * `aoc` block below). EVERY block that owns one of their children redeclares the SAME
 * parent node (identical url/action/roleNeeded/icon/label, verbatim off the live doc —
 * only `children` differs per block). This is not duplication-by-accident: it is the
 * documented "shared parent" pattern `planMenuOpsForBlocks`
 * (`apps/functions/src/tenant/apply-feature-selection.ts`, "BUG 1 FIX") exists specifically
 * to fold into ONE Firestore write, and `feature-catalogue.completeness.spec.ts` has a
 * dedicated test asserting every re-declaration of a shared key is field-identical (so a
 * genuine conflicting redeclaration is still caught, just not a deliberate, consistent one).
 *
 * Before this (task 12 review round 2), every child below was catalogued as its own
 * top-level `MenuSpec` — wrong on two counts: `apply-feature-selection.ts`'s
 * `rootNavKeys()`/`addKeys` only ever looks at a block's TOP-LEVEL specs, so each of these
 * would have been appended directly to a tenant's root nav (`menuItems/main_<tenantId>`)
 * instead of staying nested under `cms-menu`/`aoc-menu` where the live app actually renders
 * them — silently duplicating every one of these entries out of the submenu it actually
 * lives in, on the next `applyFeatureSelection` call for an existing tenant.
 */
function cmsMenuParent(children: MenuSpec[]): MenuSpec {
  return {
    key: 'cms-menu', name: 'cms-menu', url: '', action: 'sub',
    roleNeeded: 'contentAdmin', icon: 'news', label: '@main.cms.title', children,
  };
}

function aocMenuParent(children: MenuSpec[]): MenuSpec {
  return {
    key: 'aoc-menu', name: 'aoc-menu', url: '', action: 'sub',
    roleNeeded: 'admin', icon: 'admin', label: 'AOC - Operation Centre', children,
  };
}

/**
 * `subjects-menu` is a third live, genuinely SHARED parent `menuItems` doc (verified against
 * Firestore, task 13), same pattern as `cmsMenuParent`/`aocMenuParent` above: its live
 * children split across TWO domains in this bundle — `person-contacts`, `org-all`,
 * `addresses`, `group-all` belong to `subject`; `personal-rel-all`, `workrel-all`,
 * `responsibility-all` belong to `relationship`. Each owning block redeclares this SAME
 * parent node with only its own slice of children (task 13).
 */
function subjectsMenuParent(children: MenuSpec[]): MenuSpec {
  return {
    key: 'subjects-menu', name: 'subjects-menu', url: '', action: 'sub',
    roleNeeded: 'privileged', icon: 'help-circle', label: 'Subjekte', children,
  };
}

/**
 * `resource-menu` is a fourth live shared parent (verified against Firestore, task 13,
 * re-verified task 14). Its live children span TWO domains: `ownerships-all`,
 * `reservation-all`, `transfer-all` belong to `relationship` (declared here); `resource-all`,
 * `rboat-all`, `lockers-all`, `keys-all`, `boats-club`, `boats-private` belong to `resource`
 * (task 14, below) — both declare this SAME parent node (field-identical, only `children`
 * differs), the shared-parent pattern.
 *
 * Task 13 fix round 1 TODO (now acted on, task 14): `resource` needs `dependsOn:
 * ['relationship']`, not just this shared parent — verified live, `boats-club`
 * (`/ownership/scsBoats/c-ownership`), `boats-private` (`/ownership/privateBoats/c-ownership`),
 * `keys-all` (`/ownership/keys/c-keys`), `lockers-all` (`/ownership/lockers/c-lockers`) all
 * navigate into routes `relationship` owns (`ownership`), even though their own docs sit
 * under `resource-menu`, not `relationship`'s `resource-menu` slice. `bh_res`
 * (`/reservation/r_scs_default/c-reservations`) turned out NOT to be a child of
 * `resource-menu` at all (verified task 14: it is a child of the scs-only tenant-bespoke
 * `clubareal-menu`) — see the exclusion note on the `resource` block below.
 */
function resourceMenuParent(children: MenuSpec[]): MenuSpec {
  return {
    key: 'resource-menu', name: 'resource-menu', url: '', action: 'sub',
    roleNeeded: 'resourceAdmin', icon: 'help-circle', label: 'Resourcen', children,
  };
}

const calevent: FeatureBlock = {
  id: 'calevent',
  bundle: 'events',
  label: '@tenant/util.feature.calevent.label',
  icon: 'calendar',
  defaultAvailability: 'ga',
  // Restored (task 13): calevents reference a subject (organizer/attendee) — see the
  // `subject` block below, which the task 6 brief's original 'person' name was ruled (repo
  // owner, 2026-08-02) to be renamed to under the container-level granularity ruling.
  dependsOn: ['subject'],
  collections: ['calevents'],
  // Task 14: reconciled against every `calevent-feature` route in app.routes.ts. Only
  // `/yearlyevents` (`YearlyEvents`, same `calevents` collection, isPrivilegedGuard) was
  // missing from the route fragment in `@okr/tenant-routes` — added there. No live
  // `menuItems` doc exists under any name containing "yearlyevents" (verified by a
  // name-equality query) — same "un-menu'd but real, guarded route" shape as `i18n`'s
  // `/i18n/defaults` in the core bundle, so nothing to add here.
  menu: [{
    key: 'calevent-all', name: 'calevent-all', url: '/calevent/all/c-calevents',
    action: 'navigate', roleNeeded: 'eventAdmin', icon: 'calendar', label: '@main.calevent.all',
  }],
};

const aoc: FeatureBlock = {
  id: 'aoc',
  bundle: 'special',
  label: '@tenant/util.feature.aoc.label',
  icon: 'admin',
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: [],
  // TODO(task-15-18): the live `aoc-menu` doc's children[] (verified against Firestore,
  // task 12 review round 2) also lists these keys, still missing a home:
  //  - aoc-sessions, aoc-chat, aoc-account, aoc-doc, aoc-bexio, aoc-srv: route to
  //    AocSession/AocChat/AocUserAccounts/AocDoc/AocBexio/AocSrv in `aoc-feature`, i.e.
  //    genuine AOC screens (app.routes.ts's `aoc` children: sessions/chat/account/doc/
  //    bexio/srv) that never made it into this array when this block was first
  //    catalogued. Belongs HERE, as this block's own children — not a cross-domain gap.
  //  - activity-all → belongs to the future `activity` block.
  //  - divider_empty → generic reusable divider, same class as `filter-toggle`/
  //    `menudivider` — not attributable to any single domain, correctly left uncatalogued.
  // RESOLVED (task 14): `flighttracker` belongs to `mobility` (below) — nested under
  // `aocMenuParent`, not top-level, mirroring its live tree position as a child of
  // `aoc-menu`.
  // (user-all, priv-register, priv-audit — also live children of `aoc-menu` — are already
  // resolved: they're catalogued under `user`/`security` below, via `aocMenuParent`.)
  menu: [aocMenuParent([
    { key: 'aoc-admin',      name: 'aoc-admin',      url: '/aoc/adminops',   action: 'navigate', roleNeeded: 'admin', icon: 'admin',    label: '@main.aoc.admin' },
    { key: 'aoc-auth',       name: 'aoc-auth',       url: '/aoc/roles',      action: 'navigate', roleNeeded: 'admin', icon: 'key',      label: '@main.aoc.auth' },
    { key: 'aoc-content',    name: 'aoc-content',    url: '/aoc/content',    action: 'navigate', roleNeeded: 'admin', icon: 'page',     label: 'Content' },
    { key: 'aoc-data',       name: 'aoc-data',       url: '/aoc/data',       action: 'navigate', roleNeeded: 'admin', icon: 'database', label: 'Daten' },
    { key: 'aoc-statistics', name: 'aoc-statistics', url: '/aoc/statistics', action: 'navigate', roleNeeded: 'admin', icon: 'chart',    label: 'Statistiken' },
    { key: 'aoc-storage',    name: 'aoc-storage',    url: '/aoc/storage',    action: 'navigate', roleNeeded: 'admin', icon: 'documents', label: 'Storage' },
  ])],
};

const auth: FeatureBlock = {
  id: 'auth',
  bundle: 'core',
  label: '@tenant/util.feature.auth.label',
  icon: 'login',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  // Firebase Auth (email/password) is the store of record — no Firestore collection is
  // owned by this domain. `auth.service.ts` calls the Auth SDK directly and writes activity
  // log entries via `ActivityService` (the `activity` domain's collection, not auth's own).
  collections: [],
  menu: [
    { key: 'login', name: 'login', url: '/auth/login', action: 'navigate', roleNeeded: 'anonymous', icon: 'login', label: '@main.login' },
    { key: 'logout', name: 'logout', url: '/auth/logout', action: 'navigate', roleNeeded: 'registered', icon: 'logout', label: '@main.logout' },
  ],
};

const cms: FeatureBlock = {
  id: 'cms',
  bundle: 'core',
  label: '@tenant/util.feature.cms.label',
  icon: 'page',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  // Container domain: libs/cms/{icon,menu,page,section}, each owning its own Firestore collection.
  collections: ['icons', 'menuItems', 'pages', 'sections'],
  menu: [
    cmsMenuParent([
      { key: 'menu-all', name: 'menu-all', url: '/menu/all', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'menu', label: '@main.cms.menus' },
      { key: 'page-all', name: 'page-all', url: '/page/all/c-pages', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'text', label: '@main.cms.pages' },
      { key: 'section-all', name: 'section-all', url: '/section/all', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'section', label: '@content.section.plural' },
      { key: 'icon-all', name: 'icon-all', url: '/icon/all/c-icon', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'icons', label: 'Icons' },
    ]),
    { key: 'c-icon', name: 'c-icon', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'icon-add', name: 'icon-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Icon hinzufügen' },
      { key: 'icon-sync', name: 'icon-sync', url: 'sync', action: 'call', roleNeeded: 'contentAdmin', icon: 'sync', label: 'Storage synchronisieren' },
      { key: 'icon-export-raw', name: 'icon-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Rohdaten exportieren' },
    ] },
    { key: 'c-menus', name: 'c-menus', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'menu-add', name: 'menu-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Menu hinzufügen' },
      { key: 'menu-exportraw', name: 'menu-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Menus exportieren' },
    ] },
    { key: 'c-pages', name: 'c-pages', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'page-add', name: 'page-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Seite hinzufügen' },
      { key: 'page-exportraw', name: 'page-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Seiten exportieren' },
    ] },
    // Context menu of the PageDispatcher itself (rendering a CMS page + its sections) —
    // spans both the page and section subdomains, which is why it lives on the unified
    // cms block rather than being split. `page-edit` is one of its live children, NOT a
    // standalone top-level doc (task 12 review round 2: it had been mis-catalogued as its
    // own top-level sibling, which would have both duplicated it out of this submenu AND
    // appended it to the tenant's root nav — same defect class as the cms-menu/aoc-menu
    // restructuring above).
    { key: 'c-contentpage', name: 'c-contentpage', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'editmode-toggle', name: 'editmode-toggle', url: 'toggleEditMode', action: 'toggle', roleNeeded: 'registered', icon: 'edit', label: 'Edit Modus' },
      { key: 'cp-sort-sections', name: 'cp-sort-sections', url: 'sortSections', action: 'call', roleNeeded: 'registered', icon: 'sync-circle', label: 'Sektionen sortieren' },
      { key: 'cp-select-section', name: 'cp-select-section', url: 'selectSection', action: 'call', roleNeeded: 'registered', icon: 'reorder-four', label: 'Bestehende Sektion hinzufügen' },
      { key: 'cp-add-section', name: 'cp-add-section', url: 'addSection', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Neue Sektion hinzufügen' },
      { key: 'print', name: 'print', url: 'print', action: 'call', roleNeeded: 'registered', icon: 'print', label: 'Drucken' },
      { key: 'cp-exportraw', name: 'cp-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Seiteninhalt exportieren' },
      { key: 'page-edit', name: 'page-edit', url: 'editPage', action: 'call', roleNeeded: 'registered', icon: 'edit', label: 'Seite konfigurieren' },
    ] },
    { key: 'c-sections', name: 'c-sections', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'section-add', name: 'section-add', url: 'add', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Sektion hinzufügen' },
      { key: 'section-exportraw', name: 'section-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Sektionen exportieren' },
    ] },
  ],
};

const user: FeatureBlock = {
  id: 'user',
  bundle: 'core',
  label: '@tenant/util.feature.user.label',
  icon: 'people',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['users'],
  menu: [
    aocMenuParent([
      { key: 'user-all', name: 'user-all', url: '/user/all/c-users', action: 'navigate', roleNeeded: 'admin', icon: 'people', label: 'Users' },
    ]),
    { key: 'c-users', name: 'c-users', url: '', action: 'context', roleNeeded: 'admin', icon: 'help-circle', label: '', children: [
      { key: 'user-add', name: 'user-add', url: 'add', action: 'call', roleNeeded: 'admin', icon: 'edit', label: 'Neuen User hinzufügen' },
      { key: 'user-exportraw', name: 'user-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'admin', icon: 'download', label: 'Rohdaten exportieren' },
      { key: 'user-exportusers', name: 'user-exportusers', url: 'exportUsers', action: 'call', roleNeeded: 'admin', icon: 'download', label: 'Userliste exportieren' },
    ] },
  ],
};

const profile: FeatureBlock = {
  id: 'profile',
  bundle: 'core',
  label: '@tenant/util.feature.profile.label',
  icon: 'avatar-circle',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  // Self-service editing UI over PersonModel/AddressModel/UserModel — owns no collection of
  // its own; those are owned by the `subject` (task 13) and `user` (task 12) blocks.
  collections: [],
  menu: [
    { key: 'profile', name: 'profile', url: '/person/profile', action: 'navigate', roleNeeded: 'registered', icon: 'avatar-circle', label: '@main.profile' },
  ],
};

const session: FeatureBlock = {
  id: 'session',
  bundle: 'core',
  label: '@tenant/util.feature.session.label',
  icon: 'time',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['sessions'],
  // No route of its own (libs/session has data-access + util only, no feature/route layer)
  // and no live menuItems document — device/session bookkeeping is invisible infrastructure,
  // surfaced only through aoc's "User Sessions" admin screen (which belongs to the aoc block).
  menu: [],
};

const security: FeatureBlock = {
  id: 'security',
  bundle: 'core',
  label: '@tenant/util.feature.security.label',
  icon: 'shield',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  // Container domain: libs/security/{audit,processing}. Both are ephemeral/derived — the
  // privacy audit runs a callable with no persisted result, and the processing register is
  // computed from app-config on read. Neither owns a Firestore collection.
  collections: [],
  menu: [
    aocMenuParent([
      { key: 'priv-register', name: 'priv-register', url: '/security/register', action: 'navigate', roleNeeded: 'admin', icon: 'doc-safe', label: 'GDPR Bearbeitungsverzeichnis' },
      { key: 'priv-audit', name: 'priv-audit', url: '/security/privacy-audit', action: 'navigate', roleNeeded: 'admin', icon: 'checkbox-circle-double', label: 'GDPR Privacy Audit' },
    ]),
  ],
};

const i18n: FeatureBlock = {
  id: 'i18n',
  bundle: 'core',
  label: '@tenant/util.feature.i18n.label',
  icon: 'globe',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['i18nDefault', 'i18nTenantOverride'],
  // No live menuItems document was found for the admin screens at /i18n/defaults or
  // /i18n/overrides — reachable today only by typing the URL. Not a route defect (both
  // routes exist and are admin-guarded), just an un-menu'd admin screen.
  menu: [],
};

const avatar: FeatureBlock = {
  id: 'avatar',
  bundle: 'core',
  label: '@tenant/util.feature.avatar.label',
  icon: 'avatar-circle',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['avatars'],
  // No route of its own — avatar upload/selection is an embedded widget used from person,
  // org, group, user and other edit forms, not a routable screen. No live menuItems document.
  menu: [],
};

const category: FeatureBlock = {
  id: 'category',
  bundle: 'core',
  label: '@tenant/util.feature.category.label',
  icon: 'category',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['categories'],
  menu: [
    cmsMenuParent([
      { key: 'category-all', name: 'category-all', url: '/category/all/c-category', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'category', label: '@category.plural' },
    ]),
    { key: 'c-category', name: 'c-category', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'category-add', name: 'category-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Kategorie hinzufügen' },
      { key: 'category-exportraw', name: 'category-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Exportieren' },
    ] },
  ],
};

const comment: FeatureBlock = {
  id: 'comment',
  bundle: 'core',
  label: '@tenant/util.feature.comment.label',
  icon: 'chatbubbles',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['comments'],
  // No route of its own — comments are an embedded accordion/thread on person, org, user,
  // calevent, task, resource and relationship detail views, not a routable screen. No live
  // menuItems document.
  menu: [],
};

const geo: FeatureBlock = {
  id: 'geo',
  bundle: 'core',
  label: '@tenant/util.feature.geo.label',
  icon: 'location',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  // Container domain: libs/geo/{location,trip}, each owning its own Firestore collection.
  collections: ['locations', 'trips'],
  menu: [
    cmsMenuParent([
      { key: 'location-all', name: 'location-all', url: '/location/all/c-locations', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'location', label: 'Orte' },
    ]),
    { key: 'c-locations', name: 'c-locations', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'location-add', name: 'location-add', url: 'add', action: 'call', roleNeeded: 'eventAdmin', icon: 'add-circle', label: 'Ort hinzufügen' },
      { key: 'location-show', name: 'location-show', url: 'showOnMap', action: 'call', roleNeeded: 'registered', icon: 'map', label: 'Auf Karte anzeigen' },
      { key: 'location-exportraw', name: 'location-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'eventAdmin', icon: 'download', label: 'Orte exportieren' },
    ] },
    // RULED (task 12 review round 3): 'logbuch' stays a top-level `navigate` entry — that
    // IS the intended model, same as any other block-owned top-level nav item (`login`,
    // `category-all`, ...). A fresh tenant enabling `geo` for the first time gets `logbuch`
    // created AND attached to their root nav by `rootNavKeys()`/`planRootMenuOp`, exactly
    // as designed. `scs` currently has the live `logbuch` doc (`tenants: ['scs']`) but does
    // NOT list it in `main_scs.menuItems` — verified this is legacy DRIFT (it was authored
    // directly onto the tenant-bespoke `sport-menu` custom grouping before this catalogue
    // existed), not evidence against the model. The next `applyFeatureSelection` for `scs`
    // will add the one missing, correctly `tester`-gated root entry — a one-time,
    // intentional convergence, not a duplication bug.
    { key: 'logbuch', name: 'logbuch', url: '/trips/logbuch/c-trips', action: 'navigate', roleNeeded: 'tester', icon: 'track', label: 'Logbuch' },
    { key: 'c-trips', name: 'c-trips', url: '', action: 'context', roleNeeded: 'kiosk', icon: 'help-circle', label: '', children: [
      { key: 'trip-add', name: 'trip-add', url: 'add', action: 'call', roleNeeded: 'kiosk', icon: 'edit', label: 'Neue Fahrt erfassen' },
      { key: 'trip-reportdamage', name: 'trip-reportdamage', url: 'reportDamage', action: 'call', roleNeeded: 'kiosk', icon: 'warning', label: 'Schaden melden' },
      { key: 'trip-reportbug', name: 'trip-reportbug', url: 'reportBug', action: 'call', roleNeeded: 'kiosk', icon: 'bug', label: 'Fehler melden' },
      { key: 'trip-boatstats', name: 'trip-boatstats', url: 'showBoatStatistics', action: 'call', roleNeeded: 'kiosk', icon: 'chart', label: 'Boots-Statistik anzeigen' },
      { key: 'trip-personstats', name: 'trip-personstats', url: 'showPersonStatistics', action: 'call', roleNeeded: 'kiosk', icon: 'chart', label: 'Personen-Statistik anzeigen' },
      { key: 'trip-exportraw', name: 'trip-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'admin', icon: 'download', label: 'Rohdaten exportieren' },
    ] },
  ],
};

/**
 * Container domain for `libs/subject/{person,org,address,group,application,swisscities}`.
 * Per the repo owner's 2026-08-02 granularity ruling, all five feature libs are ONE block
 * (`subject`), not five — `person`/`org` blocks from an earlier draft of the plan do not
 * exist. This is the bundle's dependency root: `calevent`, and later `finance`/others, name
 * it in their own `dependsOn`.
 */
const subject: FeatureBlock = {
  id: 'subject',
  bundle: 'members',
  label: '@tenant/util.feature.subject.label',
  icon: 'id-card',
  defaultAvailability: 'ga',
  dependsOn: [],
  // PersonCollection, OrgCollection, AddressCollection, GroupCollection,
  // ApplicationCollection, AddressDirectoryCollection (all from `@okr/shared-models`,
  // verified via each subdomain's own `*.service.ts`). `swisscities` owns NO collection —
  // `SwissCitiesCollection` exists in shared-models but is unreferenced by any service;
  // `libs/subject/swisscities/ui` reads static bundled JSON assets
  // (`src/assets/cities/*.json`) instead of Firestore, confirmed by reading its sources.
  collections: ['persons', 'orgs', 'addresses', 'groups', 'applications', 'address-directory'],
  // `application` has no live `menuItems` doc anywhere in the ~350-doc collection — the
  // `/applications` screen (isPrivilegedGuard) is reachable today only by typing the URL,
  // same "un-menu'd admin screen" shape as `i18n` in the core bundle.
  //
  // NOTE on `addresses`' roleNeeded vs. its route guard: the live doc's `roleNeeded` is
  // `privileged`, but the route it points at (`/address/:contextMenuName`) is guarded by
  // `isAdminGuard()` (stricter). Since `admin` already satisfies `privileged` in
  // `hasRole`'s allow-list (`auth.util.ts`), this is NOT a privacy widening — a
  // privileged-but-not-admin user would see this menu entry and then be denied by the
  // route guard, a UX dead end, not an access leak. Copied verbatim per the rule (mirror
  // live docs, don't invent); flagged in the task report for whoever owns menuItems data
  // hygiene, not silently "fixed" here.
  menu: [
    subjectsMenuParent([
      { key: 'person-contacts', name: 'person-contacts', url: '/person/all/c-persons', action: 'navigate', roleNeeded: 'privileged', icon: 'id-card', label: '@main.members.person-contacts' },
      { key: 'org-all', name: 'org-all', url: '/org/all/c-orgs', action: 'navigate', roleNeeded: 'privileged', icon: 'company', label: 'Organisationen' },
      // `addresses`' own url points at `/address/c-address`, but `c-address` has NO live
      // `menuItems` doc anywhere (confirmed by a name-equality query, task 13 fix round 1) —
      // correct not to invent it (mirror-verbatim rule), but the PII-vault list therefore
      // renders with an empty context menu (no add/export action) for every tenant today.
      { key: 'addresses', name: 'addresses', url: '/address/c-address', action: 'navigate', roleNeeded: 'privileged', icon: 'address', label: 'Adressen' },
      { key: 'group-all', name: 'group-all', url: '/group/all/c-groups', action: 'navigate', roleNeeded: 'memberAdmin', icon: 'persons', label: 'Alle Gruppen' },
    ]),
    // Live root-level sibling of `subjects-menu` in `main_scs`, NOT nested under it —
    // mirrored verbatim (tree-shape rule).
    { key: 'group-my', name: 'group-my', url: '/group/my/c-groups', action: 'navigate', roleNeeded: 'registered', icon: 'persons', label: 'Meine Gruppen' },
    { key: 'c-persons', name: 'c-persons', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'person-add', name: 'person-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Person hinzufügen' },
      { key: 'person-export', name: 'person-export', url: 'export', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Personen exportieren' },
      { key: 'person-copy-emails', name: 'person-copy-emails', url: 'copyEmailAddresses', action: 'call', roleNeeded: 'memberAdmin', icon: 'copy', label: 'Email Adressen kopieren' },
    ] },
    { key: 'c-orgs', name: 'c-orgs', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'org-add', name: 'org-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Organisation hinzufügen' },
      { key: 'org-export-addresses', name: 'org-export-addresses', url: 'exportAddresses', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Adressen exportieren' },
      { key: 'org-copy-emails', name: 'org-copy-emails', url: 'copyEmailAddresses', action: 'call', roleNeeded: 'memberAdmin', icon: 'copy', label: 'Emails kopieren' },
    ] },
    { key: 'c-groups', name: 'c-groups', url: '', action: 'context', roleNeeded: 'privileged', icon: 'help-circle', label: '', children: [
      { key: 'group-add', name: 'group-add', url: 'add', action: 'call', roleNeeded: 'privileged', icon: 'add-circle', label: 'Gruppe hinzufügen' },
      { key: 'group-export-raw', name: 'group-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'privileged', icon: 'download', label: 'Gruppen exportieren' },
    ] },
  ],
};

/**
 * Container domain for `libs/relationship/{membership,reservation,ownership,invitation,
 * transfer,personal-rel,responsibility,workrel}` — one block, per the same container-level
 * ruling as `subject`. Depends on `subject`: every relationship links two subjects (person/
 * org/group) or a subject and a resource.
 *
 * EXCLUDED, not modelled (verified against Firestore, task 13): the live `member-menu`
 * (root child of `main_scs`, label `@main.members.title`) and `membership-menu` docs.
 * Every one of their children is either already owned elsewhere generically (`member-info`
 * → a plain CMS `/private/:id` content page, already covered by the core `cms` block) or
 * bakes a literal tenant/org key into the URL and label — `scs-active`/`scs-passive`/
 * `scs-entries`/`scs-exits`/`scs-deceased` (`/membership/<view>/scs/c-membership`,
 * "SCS Aktive" etc.), `srv-all`/`p13-all` (same shape, org `srv`/`p13`), `scs-contacts`
 * (`contact/active/scs/c-membership`). These are tenant-authored curated shortcuts over the
 * generic `membership`/`contact` routes this block DOES own — cataloguing them would seed
 * a menu item literally named "SCS Aktive" into every other tenant that ever enables this
 * block, which is inventing tenant-specific content, the opposite of mirroring it. Same
 * class of exclusion as `sport-menu` (noted on the `geo` block above): tenant-bespoke
 * curation that predates/bypasses the catalogue, correctly left uncatalogued.
 */
const relationship: FeatureBlock = {
  id: 'relationship',
  bundle: 'members',
  label: '@tenant/util.feature.relationship.label',
  icon: 'link',
  defaultAvailability: 'ga',
  dependsOn: ['subject'],
  // MembershipCollection, ReservationCollection, OwnershipCollection, InvitationCollection,
  // TransferCollection, PersonalRelCollection, ResponsibilityCollection, WorkrelCollection —
  // all verified via each subdomain's own `*.service.ts`.
  collections: ['memberships', 'reservations', 'ownerships', 'invitations', 'transfers', 'personal-rels', 'responsibilities', 'workrels'],
  menu: [
    subjectsMenuParent([
      { key: 'personal-rel-all', name: 'personal-rel-all', url: '/personalrel/all/c-prel', action: 'navigate', roleNeeded: 'memberAdmin', icon: 'heart-outline', label: 'Persönliche Beziehungen' },
      { key: 'workrel-all', name: 'workrel-all', url: '/workrel/all/c-wrel', action: 'navigate', roleNeeded: 'memberAdmin', icon: 'work', label: 'Beschäftigungen' },
      { key: 'responsibility-all', name: 'responsibility-all', url: '/responsibility/all/c-responsibility', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'target', label: 'Verantwortungen' },
    ]),
    resourceMenuParent([
      { key: 'ownerships-all', name: 'ownerships-all', url: '/ownership/all/c-ownership', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'own', label: 'Alle Nutzungen' },
      { key: 'reservation-all', name: 'reservation-all', url: '/reservation/all/c-reservations', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'reservation', label: 'Alle Reservationen' },
      // Copied verbatim, including the missing leading slash — `urlResolves` matches by
      // path segment, not string prefix, so this still resolves; not "fixed" per the
      // mirror-verbatim rule.
      { key: 'transfer-all', name: 'transfer-all', url: 'transfer/all/c-transfers', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'arrow-forward', label: 'Transfers' },
    ]),
    // Live child of the tenant-bespoke `event-menu-scs` grouping (own name literally embeds
    // "scs", same class as `sport-menu`), NOT of any generic shared parent — but the entry
    // itself is generic (no tenant/org key in its own url), same shape as `logbuch` on the
    // `geo` block above. Ruled (same precedent): stays a top-level entry here, the intended
    // model for a fresh tenant; `scs`'s current nesting under its own bespoke event menu is
    // pre-existing tenant curation, not evidence against cataloguing it as this block's own.
    { key: 'invitation-all', name: 'invitation-all', url: '/invitation/all/c-invitation', action: 'navigate', roleNeeded: 'eventAdmin', icon: 'login', label: 'Einladungen' },
    // `contextMenuName` wrapper for the `membership` route (`view: 'mcat'`, the full
    // membership admin list). `c-groupmembers` (below) is the SEPARATE wrapper for the
    // `contact` route (`view: 'contact'`) — app.routes.ts gives MembershipList two distinct
    // top-level paths with different `data.view`, and each gets its own live context doc.
    { key: 'c-membership', name: 'c-membership', url: '', action: 'context', roleNeeded: 'memberAdmin', icon: 'help-circle', label: '', children: [
      { key: 'member-add', name: 'member-add', url: 'memberAdd', action: 'call', roleNeeded: 'registered', icon: 'person-add', label: 'Neues Mitglied erfassen' },
      { key: 'membership-add', name: 'membership-add', url: 'add', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Mitgliedschaft hinzufügen' },
      { key: 'membership-copyemail', name: 'membership-copyemail', url: 'copyEmailAddresses', action: 'call', roleNeeded: 'registered', icon: 'copy', label: 'Email Adressen kopieren' },
      { key: 'membership-exportraw', name: 'membership-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Mitgliedschaften exportieren' },
      { key: 'membership-exportsrv', name: 'membership-exportsrv', url: 'exportSrv', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'SRV Liste exportieren' },
      { key: 'membership-exportmembers', name: 'membership-exportmembers', url: 'exportMembers', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Mitgliederliste exportieren' },
      { key: 'membership-exportaddresses', name: 'membership-exportaddresses', url: 'exportAddresses', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Adressliste exportieren' },
      { key: 'membership-exportclubdesk', name: 'membership-exportclubdesk', url: 'exportClubdesk', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Export für Clubdesk' },
    ] },
    { key: 'c-groupmembers', name: 'c-groupmembers', url: '', action: 'context', roleNeeded: 'privileged', icon: 'help-circle', label: '', children: [
      { key: 'membership-add', name: 'membership-add', url: 'add', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Mitgliedschaft hinzufügen' },
      { key: 'membership-copyemail', name: 'membership-copyemail', url: 'copyEmailAddresses', action: 'call', roleNeeded: 'registered', icon: 'copy', label: 'Email Adressen kopieren' },
      { key: 'membership-exportraw', name: 'membership-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Mitgliedschaften exportieren' },
      { key: 'membership-exportaddresses', name: 'membership-exportaddresses', url: 'exportAddresses', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Adressliste exportieren' },
    ] },
    // Live doc exists but currently has NO children (`menuItems: []` on the live doc) — no
    // `invitation-add`/`invitation-export` action docs exist yet. Mirrored as found, not
    // invented; `action: 'call'` entries can be added here later without touching this
    // block's shape.
    { key: 'c-invitation', name: 'c-invitation', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [] },
    { key: 'c-ownership', name: 'c-ownership', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'ownership-add', name: 'ownership-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Nutzung hinzufügen' },
      { key: 'ownership-exportraw', name: 'ownership-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Exportieren' },
    ] },
    { key: 'c-reservations', name: 'c-reservations', url: '', action: 'context', roleNeeded: 'resourceAdmin', icon: 'help-circle', label: '', children: [
      { key: 'reservation-add', name: 'reservation-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Reservation hinzufügen' },
      { key: 'reservation-exportraw', name: 'reservation-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Reservationen exportieren' },
    ] },
    { key: 'c-transfers', name: 'c-transfers', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'transfer-add', name: 'transfer-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Transfer hinzufügen' },
      { key: 'transfer-export-raw', name: 'transfer-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Transfers exportieren' },
    ] },
    { key: 'c-responsibility', name: 'c-responsibility', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'responsibility-add', name: 'responsibility-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: '@responsibility.operation.create.label' },
      { key: 'responsibility-export-raw', name: 'responsibility-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: '@responsibility.operation.export.raw' },
    ] },
    { key: 'c-wrel', name: 'c-wrel', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'wrel-add', name: 'wrel-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Beschäftigung hinzufügen' },
      { key: 'wrel-export-raw', name: 'wrel-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Beschäftigungen exportieren' },
    ] },
    // Fix round 1 (review): was missing entirely. `personal-rel-all` (above) and its route
    // both shipped without this context wrapper, so a fresh tenant enabling `relationship`
    // would render PersonalRelList with an empty action sheet — no add, no export. Verified
    // live: `menuItems/c-prel`, roleNeeded `contentAdmin`, children `prel-add`/`prel-export-raw`.
    { key: 'c-prel', name: 'c-prel', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'prel-add', name: 'prel-add', url: 'add', action: 'call', roleNeeded: 'memberAdmin', icon: 'add-circle', label: 'Neue Beziehung hinzufügen' },
      { key: 'prel-export-raw', name: 'prel-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Beziehungen exportieren' },
    ] },
  ],
};

/**
 * `libs/vcard/feature` — vCard export for a person/org (`VcardExportService`,
 * `VcardExportScopeModal`). Depends on `subject` (exports a person/org's own data) and
 * `relationship` (`vcard-export.service.ts` reads `PersonalRelCollection`/`WorkrelCollection`
 * to decide export scope — verified by reading the file).
 */
const vcard: FeatureBlock = {
  id: 'vcard',
  bundle: 'members',
  label: '@tenant/util.feature.vcard.label',
  icon: 'download',
  defaultAvailability: 'ga',
  dependsOn: ['subject', 'relationship'],
  // Owns no collection — reads AddressCollection (subject/address), AvatarCollection
  // (avatar, core), PersonalRelCollection/WorkrelCollection (relationship), all owned
  // elsewhere; verified by reading `vcard-export.service.ts` in full.
  collections: [],
  // No route — `VcardExportScopeModal` is opened from an ActionSheet on a person/org list,
  // never routed to directly; confirmed no `vcard` path in `app.routes.ts` and no live
  // `menuItems` doc under any name containing "vcard".
  menu: [],
};

/**
 * Container domain for `libs/resource/{data-access,feature,ui,util}` — a SINGLE Firestore
 * collection (`resources`) covers every resource `type` (`RESOURCE_TYPES` in
 * `resource.service.ts`: `boat`, `rboat`, `car`, `locker`, `key`, `realestate`, `pet`);
 * `ResourceList`, `RowingBoatList`, `LockerList`, `KeyList` (app.routes.ts's `/resource`,
 * `/rboat`, `/locker`, `/key`) are the same list component filtered by type, not four
 * separate domains — verified by reading `resource.service.ts` in full.
 *
 * `dependsOn: ['relationship']` — see the doc comment on `resourceMenuParent` above for why
 * (`boats-club`/`boats-private`/`keys-all`/`lockers-all` below navigate into relationship's
 * `/ownership` route).
 *
 * EXCLUDED, not modelled (verified against Firestore, task 14):
 *  - `menuItems/resource-menu-scs` — a live data quirk: its `name` FIELD is also literally
 *    "resource-menu" (only the doc id differs), but it is a tenant-bespoke reshaping for
 *    `scs` only (label "Resourcen (Schlüssel, Chäschtli...)", children include
 *    tenant-authored `res-misc`/`resource-other`) — same exclusion class as `member-menu`/
 *    `sport-menu`. `resourceMenuParent()` mirrors the OTHER, generic doc (`tenants: ['test']`).
 *  - `bh_res` (`/reservation/r_scs_default/c-reservations`) — verified to be a child of
 *    `clubareal-menu`, a scs-only tenant-bespoke parent ("Clubareal"), and its url hardcodes
 *    a specific SCS reservation resource id (`r_scs_default`) — tenant-bespoke content, not
 *    a child of `resource-menu` at all (superseding the task-13 TODO's assumption that it was).
 */
const resource: FeatureBlock = {
  id: 'resource',
  bundle: 'events',
  label: '@tenant/util.feature.resource.label',
  icon: 'hammer',
  defaultAvailability: 'ga',
  dependsOn: ['relationship'],
  collections: ['resources'],
  menu: [
    resourceMenuParent([
      { key: 'resource-all', name: 'resource-all', url: 'resource/all/c-resources', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'hammer', label: 'Resourcen' },
      { key: 'rboat-all', name: 'rboat-all', url: 'rboat/all/c-rboats', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'row_2x_side', label: 'Ruderboote' },
      // Navigates into `relationship`'s `/ownership/...` route (hence this block's
      // `dependsOn: ['relationship']`); `c-ownership`, the context wrapper both point at,
      // is already catalogued by `relationship`. Icon copied verbatim, including the odd
      // `//org.scs` value on the live doc.
      { key: 'boats-club', name: 'boats-club', url: '/ownership/scsBoats/c-ownership', action: 'navigate', roleNeeded: 'registered', icon: '//org.scs', label: 'Club-Boote' },
      { key: 'lockers-all', name: 'lockers-all', url: '/ownership/lockers/c-lockers', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'lock-closed', label: 'Garderoben' },
      { key: 'keys-all', name: 'keys-all', url: '/ownership/keys/c-keys', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'key', label: 'Schlüssel' },
      { key: 'boats-private', name: 'boats-private', url: '/ownership/privateBoats/c-ownership', action: 'navigate', roleNeeded: 'resourceAdmin', icon: 'b1x', label: 'Privat Skiffs' },
    ]),
    { key: 'c-resources', name: 'c-resources', url: '', action: 'context', roleNeeded: 'resourceAdmin', icon: 'help-circle', label: '', children: [
      { key: 'resource-add', name: 'resource-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Resource hinzufügen' },
      { key: 'resource-exportraw', name: 'resource-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Rohdaten exportieren' },
    ] },
    { key: 'c-rboats', name: 'c-rboats', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'rboat-add', name: 'rboat-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Ruderboot hinzufügen' },
      { key: 'rboat-exportraw', name: 'rboat-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Ruderboote exportieren' },
    ] },
    // `c-keys`/`c-lockers`: owned here (this block's own menu children), even though the
    // list screen they act on (`keys-all`/`lockers-all` above) is relationship's
    // OwnershipList filtered by type.
    { key: 'c-keys', name: 'c-keys', url: '', action: 'context', roleNeeded: 'resourceAdmin', icon: 'help-circle', label: '', children: [
      { key: 'key-add', name: 'key-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Schlüssel hinzufügen' },
      { key: 'key-exportraw', name: 'key-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Schlüssel exportieren' },
    ] },
    { key: 'c-lockers', name: 'c-lockers', url: '', action: 'context', roleNeeded: 'resourceAdmin', icon: 'help-circle', label: '', children: [
      { key: 'locker-add', name: 'locker-add', url: 'add', action: 'call', roleNeeded: 'resourceAdmin', icon: 'add-circle', label: 'Garderobe hinzufügen' },
      { key: 'locker-exportraw', name: 'locker-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'resourceAdmin', icon: 'download', label: 'Garderoben exportieren' },
    ] },
  ],
};

/**
 * `libs/mobility/flighttracker` — a live-flight-status lookup (`FlightTrackerService` calls
 * the `getFlightInfo` Cloud Function). Owns no Firestore collection — no persisted state,
 * purely a callable proxy; verified by reading `flighttracker.service.ts` in full.
 */
const mobility: FeatureBlock = {
  id: 'mobility',
  bundle: 'events',
  label: '@tenant/util.feature.mobility.label',
  icon: 'airplane',
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: [],
  // Live child of `aoc-menu` (task 12 review round 2 TODO on the `aoc` block, resolved
  // here, task 14) — nested under `aocMenuParent`, not top-level, mirroring its live tree
  // position.
  menu: [
    aocMenuParent([
      { key: 'flighttracker', name: 'flighttracker', url: '/flighttracker', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'airplane', label: 'Flight Tracker' },
    ]),
  ],
};

// consent: judged CORE, not `members`. The cookie/analytics-consent banner
// (`@okr/consent-ui`'s CookieBanner + `@okr/consent-data-access`) is wired into every
// tenant app's root (`okr-root.ts`/`app.config.ts`), shown to every visitor — including
// anonymous, pre-login — and is a legal/compliance surface, not a togglable business
// feature a tenant would ever want off. That is the definition of `core: true`, not a
// `members`-bundle pick. It owns no Firestore collection (state lives in `localStorage`
// via CONSENT_KEY) and no route (it is a banner component, not a routable screen).
const consent: FeatureBlock = {
  id: 'consent',
  bundle: 'core',
  label: '@tenant/util.feature.consent.label',
  icon: 'lock',
  core: true,
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: [],
  menu: [],
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
export const FEATURE_BLOCKS: FeatureBlock[] = [
  calevent, aoc,
  auth, cms, user, profile, session, security, i18n, avatar, category, comment, geo, consent,
  subject, relationship, vcard,
  resource, mobility,
];
