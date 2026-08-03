import type { BundleId, FeatureBlock } from './feature-catalogue.types';

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

const calevent: FeatureBlock = {
  id: 'calevent',
  bundle: 'events',
  label: '@tenant/util.feature.calevent.label',
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
  label: '@tenant/util.feature.aoc.label',
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
    { key: 'icon-all', name: 'icon-all', url: '/icon/all/c-icon', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'icons', label: 'Icons' },
    { key: 'c-icon', name: 'c-icon', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'icon-add', name: 'icon-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Icon hinzufügen' },
      { key: 'icon-sync', name: 'icon-sync', url: 'sync', action: 'call', roleNeeded: 'contentAdmin', icon: 'sync', label: 'Storage synchronisieren' },
      { key: 'icon-export-raw', name: 'icon-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Rohdaten exportieren' },
    ] },
    { key: 'menu-all', name: 'menu-all', url: '/menu/all', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'menu', label: '@main.cms.menus' },
    { key: 'c-menus', name: 'c-menus', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'menu-add', name: 'menu-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Menu hinzufügen' },
      { key: 'menu-exportraw', name: 'menu-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Menus exportieren' },
    ] },
    { key: 'page-all', name: 'page-all', url: '/page/all/c-pages', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'text', label: '@main.cms.pages' },
    { key: 'c-pages', name: 'c-pages', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'page-add', name: 'page-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Seite hinzufügen' },
      { key: 'page-exportraw', name: 'page-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Seiten exportieren' },
    ] },
    { key: 'page-edit', name: 'page-edit', url: 'editPage', action: 'call', roleNeeded: 'registered', icon: 'edit', label: 'Seite konfigurieren' },
    // Context menu of the PageDispatcher itself (rendering a CMS page + its sections) —
    // spans both the page and section subdomains, which is why it lives on the unified
    // cms block rather than being split.
    { key: 'c-contentpage', name: 'c-contentpage', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'editmode-toggle', name: 'editmode-toggle', url: 'toggleEditMode', action: 'toggle', roleNeeded: 'registered', icon: 'edit', label: 'Edit Modus' },
      { key: 'cp-sort-sections', name: 'cp-sort-sections', url: 'sortSections', action: 'call', roleNeeded: 'registered', icon: 'sync-circle', label: 'Sektionen sortieren' },
      { key: 'cp-select-section', name: 'cp-select-section', url: 'selectSection', action: 'call', roleNeeded: 'registered', icon: 'reorder-four', label: 'Bestehende Sektion hinzufügen' },
      { key: 'cp-add-section', name: 'cp-add-section', url: 'addSection', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Neue Sektion hinzufügen' },
      { key: 'print', name: 'print', url: 'print', action: 'call', roleNeeded: 'registered', icon: 'print', label: 'Drucken' },
      { key: 'cp-exportraw', name: 'cp-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Seiteninhalt exportieren' },
    ] },
    { key: 'section-all', name: 'section-all', url: '/section/all', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'section', label: '@content.section.plural' },
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
    { key: 'user-all', name: 'user-all', url: '/user/all/c-users', action: 'navigate', roleNeeded: 'admin', icon: 'people', label: 'Users' },
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
  // its own; those are owned by the (not-yet-catalogued) subject and user domains.
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
    { key: 'priv-register', name: 'priv-register', url: '/security/register', action: 'navigate', roleNeeded: 'admin', icon: 'doc-safe', label: 'GDPR Bearbeitungsverzeichnis' },
    { key: 'priv-audit', name: 'priv-audit', url: '/security/privacy-audit', action: 'navigate', roleNeeded: 'admin', icon: 'checkbox-circle-double', label: 'GDPR Privacy Audit' },
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
    { key: 'category-all', name: 'category-all', url: '/category/all/c-category', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'category', label: '@category.plural' },
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
    { key: 'location-all', name: 'location-all', url: '/location/all/c-locations', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'location', label: 'Orte' },
    { key: 'c-locations', name: 'c-locations', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'location-add', name: 'location-add', url: 'add', action: 'call', roleNeeded: 'eventAdmin', icon: 'add-circle', label: 'Ort hinzufügen' },
      { key: 'location-show', name: 'location-show', url: 'showOnMap', action: 'call', roleNeeded: 'registered', icon: 'map', label: 'Auf Karte anzeigen' },
      { key: 'location-exportraw', name: 'location-exportraw', url: 'exportRaw', action: 'call', roleNeeded: 'eventAdmin', icon: 'download', label: 'Orte exportieren' },
    ] },
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
];
