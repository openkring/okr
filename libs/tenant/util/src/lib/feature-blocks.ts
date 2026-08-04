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
  //
  // `document` added (task 16), by import evidence: `calevent-edit.modal.ts:12` and
  // `calevent-view.modal.ts:12` both render `DocumentsAccordion` from `@okr/document-feature`
  // — every event's attachments panel. Same reverse-edge class as the `pdf-template` edge
  // `finance` gained in task 15, which its own brief also did not anticipate.
  //
  // `chat` deliberately NOT declared (task 17): `calevent-list.ts:221,726` injects
  // `MatrixChatService` only to `sendMessage(roomId, message)` — announce an event into an
  // existing room. It renders no chat component, navigates to no chat screen, and needs no
  // menu doc `chat` owns. A pure data-access service call is not a `dependsOn` edge (the
  // service class ships in the bundle regardless). No block declares an edge to `chat` — see
  // that block for the full story, and `subject` for the menu-doc co-declaration that stands
  // in for the one edge that was briefly drawn (fix round 1).
  dependsOn: ['subject', 'document'],
  collections: ['calevents'],
  // Task 14: reconciled against every `calevent-feature` route in app.routes.ts. Only
  // `/yearlyevents` (`YearlyEvents`, same `calevents` collection, isPrivilegedGuard) was
  // missing from the route fragment in `@okr/tenant-routes` — added there.
  //
  // Fix round 1 (review, task 14) — CORRECTION: the original pass here claimed "No live
  // `menuItems` doc exists under any name containing 'yearlyevents'". That was FALSE, and
  // the query behind it was the wrong shape: it ran an exact-match `IN` filter for the
  // literal string `'yearlyevents'` (the route/nav name), which by construction cannot
  // match a differently-named doc — it never actually searched for "any name containing
  // yearlyevents". `menuItems/c-yearlyevents` DOES exist live (verified, all 16 tenants):
  // the context wrapper for `YearlyEvents`' own `:contextMenuName` route segment, `action:
  // context`, `roleNeeded: contentAdmin`, children `yearlyevent-add`/`yearlyevent-export`
  // (both `call`, generic, no tenant literal) — added below. There is still no live
  // top-level `navigate` doc for `/yearlyevents` itself (a different, and still accurate,
  // claim) — that part of the original comment was right; only the "no doc at all" framing
  // was wrong. Same false-negative risk applies to any other "verified no live doc" claim
  // in this codebase made via an exact-match query for the wrong string — worth an
  // independent recheck wherever it matters, not assumed safe by precedent.
  menu: [
    {
      key: 'calevent-all', name: 'calevent-all', url: '/calevent/all/c-calevents',
      // Fix round 1: label corrected to the live value. Was '@main.calevent.all' (an i18n
      // key format that IS genuinely used elsewhere, e.g. `aoc-admin`'s live label really is
      // `@main.aoc.admin` — so this was an outlier on THIS doc, not evidence the format
      // itself is wrong). `label` is not a `STRUCTURAL_FIELD` (menu-seed.util.ts), so no
      // live doc was ever at risk — but a newly seeded tenant would have gotten the raw,
      // untranslated key as its menu label instead of live tenants' actual "Alle Termine".
      action: 'navigate', roleNeeded: 'eventAdmin', icon: 'calendar', label: 'Alle Termine',
    },
    // Fix round 1 (review Critical 2) — was missing entirely, present since Task 5.
    // `calevent-all`'s own url ends in `/c-calevents`; verified live: `action: context`,
    // `roleNeeded: privileged`, children `[calevent-add, calevent-export-raw,
    // calevent-exportics, calevent-schedule, filter-toggle]`, all 16 tenants, all generic
    // (no tenant literal in any child's own fields).
    { key: 'c-calevents', name: 'c-calevents', url: '', action: 'context', roleNeeded: 'privileged', icon: 'help-circle', label: '', children: [
      { key: 'calevent-add', name: 'calevent-add', url: 'add', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Termin hinzufügen' },
      { key: 'calevent-export-raw', name: 'calevent-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Termine exportieren' },
      { key: 'calevent-exportics', name: 'calevent-exportics', url: 'exportIcs', action: 'call', roleNeeded: 'registered', icon: 'calendar', label: 'Kalender exportieren (ICS)' },
      { key: 'calevent-schedule', name: 'calevent-schedule', url: 'schedule', action: 'call', roleNeeded: 'privileged', icon: 'calendar-number', label: '@main.schedule' },
      // Live-data quirk: TWO `menuItems` docs share `name: 'filter-toggle'` — an
      // `isArchived: true` one (`action: call`, `url: toggleFilter`, `roleNeeded:
      // registered`, icon `search`) and a live, non-archived one (autoid doc, `action:
      // toggle`, `url: toggleFilter`, `roleNeeded: contentAdmin`, icon `eye-on`) — same
      // ambiguous-duplicate-name shape as `resource-menu`/`resource-menu-scs` (see the
      // `resource` block). Rule 10 forbids cataloguing an `isArchived: true` doc (would
      // resurrect a retired menu), so this mirrors the ACTIVE, non-archived doc's fields,
      // not the archived one `c-calevents.menuItems` happens to also list by the same name.
      // Same class of generic reusable leaf as `divider_empty` (noted on the `aoc` block) —
      // kept here only because `c-calevents` itself references it.
      { key: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle', roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen' },
    ] },
    // Fix round 1 (review Critical 1) — the `/yearlyevents/:listId/:contextMenuName` route
    // added above resolves its context menu to this doc; catalogued even though no
    // top-level `navigate` MenuSpec references it (there is none live), because the ROUTE
    // itself requires it. Verified live, all 16 tenants: `action: context`, `roleNeeded:
    // contentAdmin`, children `[yearlyevent-add, yearlyevent-export]`, both generic.
    { key: 'c-yearlyevents', name: 'c-yearlyevents', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'yearlyevent-add', name: 'yearlyevent-add', url: 'add', action: 'call', roleNeeded: 'eventAdmin', icon: 'add-circle', label: 'Anlass hinzufügen' },
      { key: 'yearlyevent-export', name: 'yearlyevent-export', url: 'exportRaw', action: 'call', roleNeeded: 'contentAdmin', icon: 'download', label: 'Anlässe exportieren' },
    ] },
  ],
};

const aoc: FeatureBlock = {
  id: 'aoc',
  bundle: 'special',
  label: '@tenant/util.feature.aoc.label',
  icon: 'admin',
  defaultAvailability: 'ga',
  // `document` added (task 16), by import evidence: three of this block's own stores —
  // `aoc-content.store.ts:18`, `aoc-doc.store.ts:14` (`DocumentService`) and
  // `aoc-data.store.ts:24` (`documentValidations`/`getDocumentIndex`) — read and repair the
  // `docs` collection directly. The `aoc-doc` entry still listed in the TODO below is
  // literally the "Dokumente" admin screen over it.
  dependsOn: ['document'],
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
  // Stays `[]` DELIBERATELY, though `libs/cms/section/feature`'s `rag-section.store.ts:15-17`
  // really does inject `DocumentService`, `buildDocumentModel` AND `FolderService` (the RAG
  // section indexes uploaded files). Not declared, because a `core: true` block declaring a
  // non-core dependency would drag `document`/`folder` into `resolveWithDeps` for EVERY
  // tenant — `cms` is always on, so the edge would make the whole `documents` bundle
  // unswitchable and defeat the gate it exists to provide.
  //
  // BE PRECISE ABOUT WHAT THAT BUYS (fix round 1 — the original wording overclaimed):
  // withholding preserves switchability IN PRINCIPLE, not in practice. `subject` (the
  // `members` root, see its own `dependsOn` below) DOES declare `['document', 'folder']`,
  // and `resolveWithDeps` walks transitively — so for any tenant that runs member
  // management, `documents` is already de-facto always-on. The only tenant this actually
  // keeps a live switch for is one that enables neither `subject` nor anything depending on
  // it. All three edges (`cms`→withheld, `avatar`→withheld, `subject`→declared) are honest;
  // reconstruct real reachability from all three, never from this comment alone.
  //
  // The RAG section keeps working either way: it calls the services directly, and block
  // enablement gates routes and menu seeding, not module loading. Flagged in the task-16
  // report as a product decision (should a tenant without `document` be offered a RAG
  // section at all?), not silently encoded as a dependency here. (task 16)
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
  // Stays `[]` DELIBERATELY, though `upload.service.ts:13-14` imports `buildDocumentModel`
  // and `DocumentService` from `@okr/document-*` (every uploaded avatar is also recorded as
  // a `docs` row). Same reasoning as on the `cms` block: a `core: true` block must not name
  // a non-core dependency, or the always-on core makes `document` permanently on for every
  // tenant. It would also be a dependsOn CYCLE — `libs/document` imports `UploadService`
  // and `readAsFile` straight back out of `@okr/avatar-*`.
  //
  // Same honest caveat as on `cms` (fix round 1): this preserves switchability only IN
  // PRINCIPLE. `subject` declares `dependsOn: ['document', 'folder']` and `resolveWithDeps`
  // is transitive, so any tenant with member management already has `documents` on
  // regardless. Read all three comments (`cms`, here, `subject`) together — no one of them
  // states the full reachability. (task 16)
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
  // Was `[]`. `document` + `folder` added (task 16), by import evidence, not by theme:
  //  - `group-view.page.ts` renders `DocumentList` (`@okr/document-feature`) as the group's
  //    whole "Dateien" segment, and injects `FolderService` + `canManageFolders`
  //    (`@okr/folder-*`) to decide who may create folders in it.
  //  - `addresses.store.ts:21-22` injects BOTH `DocumentService` and `FolderService`.
  //  - `person-edit.modal.ts`, `person-edit.page.ts` and `org-edit.modal.ts` each render
  //    `DocumentsAccordion` and use `getDocumentStoragePath`.
  // No cycle: neither `libs/document` nor `libs/folder` imports any `@okr/subject-*` lib
  // (verified by listing every `@okr/*` import in both domains).
  //
  // THIS IS THE EDGE THAT ACTUALLY DECIDES REACHABILITY (fix round 1). `subject` is the
  // `members` root essentially every tenant enables, and `resolveWithDeps` walks
  // transitively — so this single edge makes the `documents` bundle de-facto always-on for
  // any tenant with member management. The `cms` and `avatar` blocks above withhold their
  // own (equally real) `document` edges to keep the bundle switchable, but that only holds
  // for a tenant enabling neither `subject` nor anything depending on it. All three
  // comments must be read together; none tells the whole story alone.
  //
  // NO `chat` EDGE — and the group view's chat segment is protected anyway, by CO-DECLARING
  // `contextMenuChat` in this block's own `menu` below instead (task 17 fix round 1). The
  // two halves of the story:
  //
  //  - WHAT IS REAL: `group-view.page.ts` renders the group's "Chat" segment as
  //    `<okr-page-dispatcher id="{{id + '_chat'}}" [isGroupView]="true">` (lines 118-120) and
  //    hoists that segment's context menu out of the dispatcher (`segmentContextMenuName()`,
  //    line 256 → `PageDispatcher.hoistMenuName()` → `page.dispatcher.ts:161`, which resolves
  //    to `contextMenuChat` whenever the route carries no `:contextMenuName`). Without that
  //    menu doc on the tenant, `MenuService.read` returns nothing and the segment renders
  //    with an empty room menu.
  //  - WHY THAT IS *NOT* THE `document` CASE, precisely (the first pass called the two
  //    "structurally identical" — WRONG, and the difference is the whole argument): the
  //    "Dateien" segment imports and renders `DocumentList` from `@okr/document-feature`
  //    (`group-view.page.ts:19`, template line 152), i.e. a COMPONENT crosses the block
  //    boundary — that is an edge under the settled dividing line. The chat segment renders
  //    `PageDispatcher` from `@okr/cms-page-feature`, which is `core: true`; NO chat
  //    component crosses the boundary here at all. Only the menu-doc half of the analogy
  //    holds, and a menu doc is not a reason to drag a whole block in.
  //
  // The edge was therefore dropped in favour of co-declaration, per the conventions' "when
  // only a menu doc is at stake, co-declare it" rule. An edge would have made `chat` — an
  // EXTERNAL processor (Matrix/etke.cc) with no DPA — de-facto always-on for every
  // member-management tenant, and, because `resolveWithDeps` also feeds `rootNavKeys`, would
  // have appended chat's top-level `navigate` row (`roleNeeded: registered`) to their root
  // menus: a far bigger footprint than the room popover it was drawn to protect. It would
  // not even have made the segment functional — `integrations.matrix` gates the Matrix client
  // independently of block selection. See the `chat` block below for the full picture.
  dependsOn: ['document', 'folder'],
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
    // CO-DECLARED with the `chat` block (task 17 fix round 1) — field-identical there, only
    // this comment differs. It is here, not behind a `dependsOn: ['chat']`, because the group
    // view's "Chat" segment resolves ITS context menu to this key
    // (`group-view.page.ts:256` → `page.dispatcher.ts:161`) while embedding only
    // `PageDispatcher`, a `core: true` component — a menu doc is the ONLY thing that crosses
    // the block boundary, so co-declaration delivers the whole protection and `chat` stays
    // switchable. See the long note above `dependsOn` for the full argument, and the `chat`
    // block for the doc's own provenance. The machinery supports this deliberately: the
    // cross-block field-identity test in `feature-catalogue.completeness.spec.ts` tolerates a
    // consistent redeclaration, `planMenuOpsForBlocks` folds both copies into ONE Firestore
    // write, `blockOwnersOfMenuKey` resolves visibility to "any effective owner", and
    // `rootNavKeys` filters to `navigate`/`sub` so this `context` spec never reaches a root
    // nav. If you edit either copy, edit both.
    { key: 'contextMenuChat', name: 'contextMenuChat', url: '', action: 'context', roleNeeded: 'admin', icon: 'help-circle', label: '', children: [
      { key: 'chat-room-add', name: 'chat-room-add', url: 'addRoom', action: 'call', roleNeeded: 'admin', icon: 'add-circle', label: 'Chat Raum hinzufügen' },
      { key: 'chat-room-edit', name: 'chat-room-edit', url: 'editRoom', action: 'call', roleNeeded: 'admin', icon: 'edit', label: 'Chat Raum bearbeiten' },
    ] },
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
  // `document` added (task 16), by import evidence: `membership-edit.modal.ts:11`,
  // `ownership-edit.modal.ts:8` and `personal-rel-edit.modal.ts:11` each render
  // `DocumentsAccordion` from `@okr/document-feature` (contracts/agreements attached to a
  // membership, a boat ownership, a personal relationship). `folder` is NOT declared here:
  // no `libs/relationship/**` file imports `@okr/folder-*` — it arrives transitively
  // through `document`'s own `dependsOn`, which is where the real edge is.
  //
  // `chat` deliberately NOT declared (task 17), although `membership.store.ts:722` and
  // `reservation.store.ts:430` both `createDirectRoom(...)` and then
  // `navigateByUrl(store.router, '/private/chat/c-contentpage', ...)`. That destination is
  // cms's `private/:id/:contextMenuName` route with cms's OWN `c-contentpage` wrapper — both
  // `core: true` and unconditionally seeded — so nothing the `chat` block gates is required
  // for the navigation to land on a working screen, and no menu doc of chat's is involved.
  // NO block declares an edge to `chat`; `subject`, whose group view does hoist chat's
  // `contextMenuChat`, CO-DECLARES that one doc instead of depending on the block (fix round
  // 1). See the `chat` block for the full story.
  dependsOn: ['subject', 'document'],
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
 *  - `boat-menu` ("Ruderbetrieb und Boote") and `boathouse-menu` ("Bootshaus Projekt") — both
 *    `tenants: ['scs']`, both tenant-authored groupings mixing generic specs this block DOES
 *    catalogue (`boat-menu` lists `rboat-all`, `boats-club`, `boats-private` alongside
 *    scs-authored siblings `ruderordnung`, `fahrordnung`, `boat-info`, `boot-strategie`,
 *    `skiffplatz`, `boat-res`, `boat-maint`) with scs-only content (`boathouse-menu`'s
 *    children — `bh_history`, `bh_varianten`, `bh_org`, `bh_projekt`, `bh_plaene`,
 *    `bh_finance` — are entirely SCS boathouse-project pages, no generic sibling at all).
 *    Same tenant-bespoke-grouping exclusion as `member-menu`/`sport-menu`: the parent DOCS
 *    are excluded, not the generic specs they happen to also reference — `rboat-all`/
 *    `boats-club`/`boats-private` are still catalogued here, just under `resourceMenuParent`,
 *    not under a redeclaration of `boat-menu`.
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
      // is already catalogued by `relationship`.
      //
      // `scsBoats` in the url is legacy NAMING, not a tenant-specific value: it's a
      // first-class, hardcoded listId understood by `OwnershipList`/`OwnershipService` for
      // EVERY tenant, not a per-tenant config value — `OwnershipExportList` (`ownership-
      // export.ts:10`) types it as one of a fixed literal union (`'all' | 'ownerships' |
      // 'scsBoats' | 'privateBoats' | 'lockers' | 'keys'`), and `ownership.store.ts:411`
      // switches on it the same way for any tenant. Legacy-named, but genuinely generic
      // code — correct to catalogue verbatim, not a tenant leak.
      //
      // `icon: '//org.scs'` is NOT the same case — flagging as a live-data defect rather
      // than justifying it: this looks like a real scs-org storage asset path (an org
      // logo/badge), which is genuinely tenant-specific. Mirrored verbatim per the
      // mirror-rule (never invent), but a newly seeded tenant would get this literal value
      // written into their own `boats-club` doc and it would render blank there — worth a
      // decision by whoever owns menu-doc/icon hygiene, not silently "fixed" here.
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

/**
 * Container domain for `libs/finance/{account,accounting,asset,bill,booking,exchange-rate,
 * expense,invoice,ocr-rule,payment,period,reporting,vat-code}` — ONE block, per the same
 * container-level ruling as `subject`/`relationship`/`resource`. NOTE: that is THIRTEEN
 * subdomains, not the twelve the task brief lists — `exchange-rate` is a real 13th
 * (`ExchangeRateService`, `exchange-rates` collection) with no route and no menu of its own,
 * consumed by booking/invoice for FX conversion. Counted here so it is not mistaken for an
 * omission.
 *
 * `dependsOn`:
 *  - `subject` — invoices/bills address persons and organisations; verified by import, not
 *    assumed: `libs/finance` imports `@okr/subject-person-data-access`,
 *    `@okr/subject-org-data-access`, `@okr/subject-address-data-access` and
 *    `@okr/subject-address-util`. Both person and org live in the single `subject` block.
 *  - `pdf-template` — NOT in the task brief, added on evidence. RESTATED (task 17 fix round 1)
 *    because the original wording rested it on the wrong clause: `booking.store.ts:37` does
 *    import `DocGenerationService` from `@okr/pdf-template-data-access`, but a data-access
 *    service import is explicitly NOT an edge (see `folder`/`chat` → `activity` below). The
 *    edge stands on the DATA clause instead: the `generateDocument` action
 *    (`booking.store.ts:279-317`) calls `generate({ templateId: action.templateId, … })`, and
 *    that id must name a document in `templates` — a collection whose only writer is
 *    `TemplateService`, which is referenced nowhere outside `libs/pdf-template` (grepped
 *    across `libs/` and `apps/`: zero hits). Templates are therefore authorable ONLY on
 *    `pdf-template`'s own routes (`/templates`, `/templates/:templateKey`). With
 *    `pdf-template` off, a tenant has no screen able to create one, so finance's document
 *    generation is not degraded but permanently dead — "X needs data only Y's screens can
 *    author", the fourth arm of the dividing line.
 *
 * STILL OWED, and it is a real edge — `task`: `expense.store.ts:123` destructures
 * `TaskEditModal` out of a dynamic import of the `task` feature lib, i.e. finance's own expense
 * screen opens a COMPONENT out of another block's feature lib (the first arm of the dividing
 * line, same shape as `subject` embedding `DocumentList`). NOTE the lib name is spelled out
 * here rather than written as a literal dynamic-import expression on purpose: the
 * `lib-refs`/`gen-lib-references` scanner matches `import('@okr/…')` anywhere in a file,
 * COMMENTS INCLUDED, and quoting that call verbatim makes it record a `tenant/util →
 * task/feature` reference and abort on the resulting cycle. `task` is not yet a catalogue block
 * and `dependsOn` targets must already exist (enforced by
 * `feature-catalogue.completeness.spec.ts`), so it cannot be declared today.
 * TODO(task 18 — `task`): add `'task'` to `dependsOn` when that block lands.
 *
 * NO EDGE for `@okr/activity-data-access` (task 17 fix round 1 — a TODO claiming one used to
 * sit here and was wrong): `bill.service.ts:9` and `invoice.service.ts:9` inject
 * `ActivityService` purely to write audit-trail entries. That effect is invisible on finance's
 * own surface — no route and no menu row of finance's breaks without it — which is the
 * settled "no edge" case, identical to `folder` and `chat`.
 *
 * EXCLUDED, not modelled — the whole double-entry accounting nav, verified against Firestore:
 *  - `scsf_fibu` ("SCS Buchhaltung") and `gssf_fibu` ("GSS Buchhaltung"), both `action: sub`,
 *    both `tenants: ['scs']`, and ALL 24 of their `scsf_*`/`gssf_*` children. Every one of
 *    those children hardcodes an accounting-tenant key in its url (`/accounting/scs/journal/
 *    c-journal`, `/accounting/gss/bill/all/c-bill`, ...). This is STRUCTURAL, not sloppy
 *    authoring: the route is `accounting/:accountingTenantId/...`, so a `navigate` entry into
 *    accounting is *by construction* specific to one legal entity's books (SCS the club vs.
 *    GSS the supporters' association) — there is no generic url to catalogue. Consequence,
 *    stated plainly rather than hidden: a fresh tenant enabling `finance` gets the accounting
 *    ROUTES and every context wrapper below, but must author its own `<x>f_fibu` submenu with
 *    its own accounting-tenant key. Same for `ocr-rules` (`accounting-ocr-rules/scs/
 *    ocr-rule-context`, a child of `scsf_fibu`) and `invoice-my` (`/accounting/scs/invoice/my/
 *    c-invoice`, a child of `finance-menu`).
 *  - `finance-menu`'s four remaining live children `f_fees`, `f_pay`, `f_gss`,
 *    `f_versicherung` — all `/private/<id>/c-contentpage` CMS content pages authored by
 *    `scs`, already covered generically by the core `cms` block's route; and `finance-docs`,
 *    `action: 'browse'` pointing at an SCS-specific Nextcloud share link. Tenant-bespoke
 *    content, same exclusion class as `member-menu`/`sport-menu`.
 *  - `fibu` and `budget` — both live docs, both `action: 'divider'`, both `tenants: ['scs']`,
 *    both labelled "tbd: ..." (placeholders for unbuilt screens). `divider` is not even a
 *    member of `MenuSpec['action']`.
 *
 * DEAD LINK found and NOT invented around (report, don't fix): the `accounting/
 * :accountingTenantId` route's own default child redirects to `journal/journal-context`
 * (`app.routes.ts`), i.e. it names a `:contextMenuName` of `journal-context` — and NO live
 * `menuItems` doc by that name exists. Verified twice, by two query shapes: a name-equality
 * `IN` query returned zero hits, and a full 352-document dump of the collection masked to
 * `name`/`url`/`action` contains no `journal-context` anywhere. The live tenant-authored
 * entries (`scsf_journal`/`gssf_journal`) navigate to `.../journal/c-journal` instead and
 * work. So the redirect target is a real dead context menu: landing on bare
 * `/accounting/<tid>` renders BookingList with an empty action sheet. `c-journal` is
 * catalogued below (it is the wrapper the working urls use); the redirect is copied verbatim
 * into the route fragment, not "corrected", per the mirror rule.
 */
const finance: FeatureBlock = {
  id: 'finance',
  bundle: 'finance',
  label: '@tenant/util.feature.finance.label',
  icon: 'invoice',
  defaultAvailability: 'ga',
  dependsOn: ['subject', 'pdf-template'],
  // Every `*Collection` constant in `@okr/shared-models` reachable from this domain, in
  // subdomain order. The first seventeen are referenced by a `libs/finance/**` service
  // (AccountCollection, AccountingConfigCollection, AssetCollection, AssetCategoryCollection,
  // AssetMovementCollection, BillCollection, BookingCollection, BookingLineCollection,
  // ExchangeRateCollection, ExpenseCollection, ExpenseDocumentCollection, InvoiceCollection,
  // OcrRuleCollection, PaymentCollection, PaymentOrderCollection, PeriodCollection,
  // VatCodeCollection — grepped, not guessed).
  //
  // The last two have NO client-side reference and are listed deliberately, because this
  // array is what a later retention pass acts on and an omission there is silent data
  // retained forever:
  //  - `invoice-positions` (`InvoicePositionCollection`) — written by the Bexio replication
  //    path, and the privacy subject-data-map already treats it as personal data
  //    (`apps/functions/src/privacy/subject-data-map.ts:431` queries it by `personKey`; it
  //    carries `firstName`/`lastName`/`anonymizedAt`). Unambiguously finance's.
  //  - `ocr-results` (`OcrResultCollection`) — written and read only by Cloud Functions
  //    (`apps/functions/src/ocr/index.ts`, `apps/functions/src/booking/index.ts`, which
  //    reference it as a string literal `OCR_RESULT_COLLECTION`, which is why a grep for the
  //    shared-models constant misses it). Holds scanned-bill OCR payloads keyed by
  //    `bookingKey`/`correlationKey` — finance's, not a shared infrastructure collection.
  collections: [
    'accounts', 'accounting-configs', 'assets', 'asset-categories', 'asset-movements',
    'bills', 'bookings', 'booking-lines', 'exchange-rates', 'expenses', 'expense-documents',
    'invoices', 'invoice-positions', 'ocr-rules', 'ocr-results', 'payments', 'payment-orders',
    'periods', 'vat-codes',
  ],
  menu: [
    // `finance-menu` is a live root child of `main_scs` (`action: sub`, `roleNeeded:
    // registered`, label `@main.finance.title`) whose own name/url/label carry no tenant key —
    // so unlike `scsf_fibu`/`gssf_fibu` it IS catalogued, with only its two generic children.
    // Declared inline rather than via a `financeMenuParent()` helper because, unlike
    // `cms-menu`/`aoc-menu`/`subjects-menu`/`resource-menu`, no second block owns any of its
    // children — every other live child is excluded (see the block comment). Children are
    // APPENDED, never replaced (`planMenuOps`), so scs's existing six extra children survive.
    {
      key: 'finance-menu', name: 'finance-menu', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@main.finance.title', children: [
        { key: 'expenses', name: 'expenses', url: '/expense/my/c-expense', action: 'navigate', roleNeeded: 'registered', icon: 'expense', label: 'Meine Spesen' },
        { key: 'expenses-all', name: 'expenses-all', url: '/expense/all/c-expense', action: 'navigate', roleNeeded: 'treasurer', icon: 'expense', label: 'Alle Spesen' },
      ],
    },
    { key: 'c-expense', name: 'c-expense', url: '', action: 'context', roleNeeded: 'registered', icon: 'help-circle', label: '', children: [
      { key: 'expense-add', name: 'expense-add', url: 'add', action: 'call', roleNeeded: 'registered', icon: 'add-circle', label: 'Neue Spesen-Abrechnung' },
      // Live-data note: this doc's stale `index` string reads `a:callFunction`, but its
      // `action` FIELD — the authoritative one, and the only one `MenuSpec` models — is
      // `call`. `index` is regenerated from `name`/`action`/`okey` on every write
      // (`menuIndex` in `menu-seed.util.ts`), so the drift self-heals; mirrored off `action`.
      { key: 'expense-export', name: 'expense-export', url: 'export', action: 'call', roleNeeded: 'treasurer', icon: 'download', label: 'Export' },
    ] },
    // The five wrappers below are catalogued even though NO catalogued `navigate` url points
    // at them — every live url that does is one of the excluded tenant-bespoke `scsf_*`/
    // `gssf_*` entries. They are required all the same: each is the `:contextMenuName`
    // segment of a route this block owns (`accounting/:tid/journal/:contextMenuName`,
    // `.../invoice/:listId/:contextMenuName`, `.../bill/:listId/:contextMenuName`,
    // `.../account/:contextMenuName`, `accounting-ocr-rules/:tid/:contextMenuName`). Without
    // them the tenant is never added to their `tenants[]`, `MenuService.read` returns
    // nothing, and every accounting list renders with an empty action sheet — the exact p13
    // failure mode. Note the context-wrapper test in `@okr/tenant-routes` structurally CANNOT
    // catch this class: it walks `navigate` urls for `c-*` segments, and these wrappers are
    // reachable only through a route parameter (and `ocr-rule-context` does not even match
    // the `c-` prefix). Same precedent as `c-yearlyevents` on the `calevent` block.
    { key: 'c-journal', name: 'c-journal', url: '', action: 'context', roleNeeded: 'treasurer', icon: 'help-circle', label: '', children: [
      { key: 'journal-add', name: 'journal-add', url: 'add', action: 'call', roleNeeded: 'treasurer', icon: 'add', label: 'Neue Buchung erfassen' },
      { key: 'journal-export', name: 'journal-export', url: 'export', action: 'call', roleNeeded: 'treasurer', icon: 'download', label: 'Journal exportieren' },
    ] },
    { key: 'c-invoice', name: 'c-invoice', url: '', action: 'context', roleNeeded: 'treasurer', icon: 'help-circle', label: '', children: [
      { key: 'invoice-add', name: 'invoice-add', url: 'add', action: 'call', roleNeeded: 'treasurer', icon: 'add-circle', label: 'Neue Rechnung erstellen' },
      { key: 'invoice-export-raw', name: 'invoice-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'treasurer', icon: 'download', label: 'Rohdaten exportieren' },
    ] },
    { key: 'c-bill', name: 'c-bill', url: '', action: 'context', roleNeeded: 'treasurer', icon: 'help-circle', label: '', children: [
      { key: 'bill-add', name: 'bill-add', url: 'add', action: 'call', roleNeeded: 'treasurer', icon: 'add', label: 'Kreditorenrechnung erstellen' },
      { key: 'bill-scan', name: 'bill-scan', url: 'scan', action: 'call', roleNeeded: 'treasurer', icon: 'scan', label: 'Rechnung scannen' },
      { key: 'bill-export-raw', name: 'bill-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'treasurer', icon: 'download', label: 'Kreditorenrechnungen exportieren' },
    ] },
    { key: 'c-account', name: 'c-account', url: '', action: 'context', roleNeeded: 'treasurer', icon: 'help-circle', label: '', children: [
      { key: 'account-create', name: 'account-create', url: 'create', action: 'call', roleNeeded: 'treasurer', icon: 'edit', label: 'Kontoplan hinzufügen' },
      { key: 'account-delete', name: 'account-delete', url: 'delete', action: 'call', roleNeeded: 'treasurer', icon: 'trash', label: 'Kontoplan löschen' },
      { key: 'account-export', name: 'account-export', url: 'export', action: 'call', roleNeeded: 'treasurer', icon: 'download', label: 'Kontoplan herunterladen' },
    ] },
    // Not named `c-…` — the live doc really is `ocr-rule-context` (same naming outlier class
    // as `forms-context`/`contextMenuChat`). Copied verbatim; renaming it would orphan the
    // live doc.
    { key: 'ocr-rule-context', name: 'ocr-rule-context', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'ocr-rule-add', name: 'ocr-rule-add', url: 'add', action: 'call', roleNeeded: 'treasurer', icon: 'add-circle', label: 'Neue OCR Regel' },
      { key: 'ocr-rule-export', name: 'ocr-rule-export', url: 'export', action: 'call', roleNeeded: 'treasurer', icon: 'download', label: 'Export' },
    ] },
  ],
};

/**
 * `libs/esign/{data-access,feature,util}` — send a PDF out for electronic signature
 * (upload → field scan → invite signees → webhook-driven status), backed by the
 * `apps/functions/src/esign/*` callables.
 *
 * `dependsOn: []` — the task brief asked for `dependsOn: ['finance']` ONLY if signing is
 * genuinely unreachable except from finance documents. It is NOT, and the reasoning is
 * evidence-based rather than assumed:
 *  1. The route is a standalone top-level `/esign` (`isPrivilegedGuard`) rendering
 *     `EsignList` — it is not nested under `accounting/:accountingTenantId` and takes no
 *     finance parameter.
 *  2. Grepping every importer of `@okr/esign-feature` / `-data-access` / `-util` across
 *     `libs/` and `apps/` returns only esign's own five files plus `app.routes.ts`. No
 *     finance (or document, or cms) component opens an esign modal.
 *  3. The reverse direction is empty too: a case-insensitive grep for "esign" across
 *     `libs/finance`, `libs/pdf-template` and `libs/document` matches nothing but unrelated
 *     German/French/Spanish i18n strings containing the substring ("Design", "designa").
 *  4. `EsignSendDocumentModal` uploads an arbitrary user-picked file to Storage and scans it
 *     for form fields; nothing in its inputs references an invoice, bill or booking.
 *  5. Its own imports are `@okr/shared-*` only — no cross-domain dependency at all.
 * Signing a finance PDF is a plausible USE of the feature, but the code does not wire the
 * two together, and a dependency the code does not have would wrongly force `finance` on for
 * a tenant that only wants contracts signed.
 *
 * Live menu: a single `navigate` doc (`/esign`, `roleNeeded: contentAdmin`, icon `shield`,
 * label "E-Signature") which is a CHILD of the shared `cms-menu` parent — verified in
 * `cms-menu.menuItems`, which lists `[..., 'templates', 'forms-all', 'esign']`. Nested via
 * `cmsMenuParent()` accordingly, not declared top-level.
 */
const esign: FeatureBlock = {
  id: 'esign',
  bundle: 'finance',
  label: '@tenant/util.feature.esign.label',
  icon: 'shield',
  defaultAvailability: 'ga',
  dependsOn: [],
  // `EsignCollection` = 'esignList' (client, `esign.service.ts`) and `EsignAuditCollection` =
  // 'esignAudit' (Cloud Functions only, `apps/functions/src/esign/esign-delete.ts` — an
  // append-only tombstone trail that must outlive the record it describes, so it is listed
  // here explicitly for the retention pass rather than left implicit).
  collections: ['esignList', 'esignAudit'],
  menu: [
    cmsMenuParent([
      { key: 'esign', name: 'esign', url: '/esign', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'shield', label: 'E-Signature' },
    ]),
  ],
};

/**
 * `libs/pdf-template/{data-access,feature,ui,util}` — Handlebars PDF templates plus the
 * headless-Chrome rendering callable (`apps/functions/src/pdf/*`), used for invoices,
 * bills, QR payment slips and CMS page exports.
 *
 * `dependsOn: []` deliberately, in the direction that surprises: pdf-template is a
 * DEPENDENCY of other blocks (`finance` declares it above; `@okr/cms-page-feature`'s
 * `page.store.ts` and `@okr/security-*-feature` also import it) and depends on nothing
 * outside `@okr/shared-*` itself. Enabling it alone is meaningful — the `/templates` admin
 * screen stands on its own.
 *
 * Live menu: a single `navigate` doc (`/templates`, `roleNeeded: contentAdmin`, icon `form`,
 * label "Templates"), a CHILD of the shared `cms-menu` parent (verified in
 * `cms-menu.menuItems`) — nested via `cmsMenuParent()`, not top-level.
 */
const pdfTemplate: FeatureBlock = {
  id: 'pdf-template',
  bundle: 'finance',
  label: '@tenant/util.feature.pdf-template.label',
  icon: 'form',
  defaultAvailability: 'ga',
  dependsOn: [],
  // `TemplateCollection` = 'templates' (client, `template.service.ts`) and
  // `DocGenerationCollection` = 'docGenerations' (Cloud Functions only,
  // `apps/functions/src/pdf/generate-document.ts` — the per-render audit record). Both from
  // `@okr/shared-models`.
  collections: ['templates', 'docGenerations'],
  menu: [
    cmsMenuParent([
      { key: 'templates', name: 'templates', url: '/templates', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'form', label: 'Templates' },
    ]),
  ],
};

/**
 * `libs/document/{data-access,feature,ui,util}` — the tenant's file library. `DocumentList`
 * browses a folder tree of uploaded files (`/document/:listId/:contextMenuName`);
 * `DocumentsAccordion` is the embedded attachments panel that person/org/calevent/
 * membership/ownership/personal-rel edit modals render; plus the revisions modal and the
 * image picker used by CMS sections. Owns `docs` (`DocumentCollection = 'docs'`,
 * `document.service.ts`) — and only that: revisions are an array field ON `DocumentModel`,
 * not a second collection (`document-revisions.modal.ts` reads `DocumentStore`, touches no
 * collection of its own), and the file bytes live in Cloud Storage, not Firestore.
 * Cross-checked against `apps/functions/src/privacy/subject-data-map.ts:549`, which knows
 * exactly one document collection (`docs`, by `authorKey`).
 *
 * `dependsOn: ['folder']` — hard, not decorative. `document-list.ts` renders
 * `FolderBreadcrumb` (`@okr/folder-ui`) in its permanent toolbar and gates on
 * `canEditFolder` (`@okr/folder-util`); `document.store.ts` injects `FolderService`, calls
 * `newFolderModel`, and dynamically imports `FolderEditModal` from `@okr/folder-feature`
 * for the `addFolder` action. DocumentList cannot even draw its own header without folder.
 *
 * NOT declared although they ARE real runtime imports — `avatar` and `cms`:
 * `document.store.ts` and `image-select.modal.ts` inject `UploadService`
 * (`@okr/avatar-data-access`), `document.util.ts` uses `readAsFile` (`@okr/avatar-util`),
 * and `document-list.ts` renders `Menu` (`@okr/cms-menu-feature`). Both targets are
 * `core: true`, i.e. unconditionally effective for every tenant, and NO block in this
 * catalogue declares a core dependency (every core block itself carries `dependsOn: []`) —
 * following that convention rather than inventing an exception here. Declaring `avatar`
 * would additionally create a dependsOn CYCLE, because `avatar`'s own `upload.service.ts`
 * imports `DocumentService`/`buildDocumentModel` back out of this domain
 * (`resolveWithDeps` terminates on cycles, so it would not crash — it would just be an
 * unreadable statement of a mutual, always-satisfied relationship).
 *
 * MENU/ROUTE ROLE MISMATCH, reported not "fixed" (same class as `addresses` on the
 * `subject` block): the live `document-all` doc's `roleNeeded` is `contentAdmin`, but the
 * route it navigates to is guarded by `isPrivilegedGuard`. `hasRole` (`auth.util.ts`)
 * satisfies `privileged` from `['privileged', 'admin']` only — `contentAdmin` is NOT in
 * that list. So a contentAdmin-but-not-admin user sees the "Dokumente" entry and is then
 * bounced by the route guard: a UX dead end, not an access leak (the guard is the stricter
 * side). Copied verbatim per the mirror rule; flagged for whoever owns menuItems hygiene.
 */
// Named `documentBlock`, not `document`: a module-scope `const document` would shadow the
// DOM global of that name for the whole file.
const documentBlock: FeatureBlock = {
  id: 'document',
  bundle: 'documents',
  label: '@tenant/util.feature.document.label',
  icon: 'documents',
  defaultAvailability: 'ga',
  dependsOn: ['folder'],
  collections: ['docs'],
  menu: [
    // Verified live: `document-all` is a CHILD of the shared `cms-menu` parent doc — its
    // `menuItems` array reads `[cms-graph, menu-all, page-all, section-all, document-all,
    // location-all, ...]`. Nested via `cmsMenuParent()` accordingly, never top-level
    // (rule 2: mirror the live TREE SHAPE, not just the node).
    cmsMenuParent([
      { key: 'document-all', name: 'document-all', url: '/document/all/c-documents', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'documents', label: '@main.cms.documents' },
    ]),
    // The `:contextMenuName` wrapper `document-all`'s own url points at. Verified live,
    // all 16 tenants: `action: context`, `roleNeeded: contentAdmin`, children
    // `[document-add, document-export-raw, filter-toggle]`, all generic (no tenant literal
    // in any field). NOTE the doc is named `c-documents`, NOT `c-docs` — `document-list.ts:60`
    // has a stale code comment calling it "the c-docs addFiles menu item"; no `menuItems`
    // doc named `c-docs` exists (checked two ways: a name-equality `IN` query returned
    // nothing, and an ordered range scan of every doc whose `name` sorts in [`c-d`, `c-g`)
    // returned exactly `c-documents`, `c-expense`, `c-folder`).
    { key: 'c-documents', name: 'c-documents', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
      { key: 'document-add', name: 'document-add', url: 'add', action: 'call', roleNeeded: 'registered', icon: 'upload', label: 'Dokument hinzufügen' },
      { key: 'document-export-raw', name: 'document-export-raw', url: 'exportRaw', action: 'call', roleNeeded: 'registered', icon: 'download', label: 'Export Rohdaten' },
      // Same ACTIVE (non-archived) `filter-toggle` doc the `calevent` block already
      // declares — field-identical here on purpose (two live docs share this name; the
      // `isArchived: true` one must not be catalogued, rule 10). See the long note on
      // `c-calevents` above.
      { key: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle', roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen' },
    ] },
    // `c-folder` is catalogued HERE, on `document`, despite its name — and it is catalogued
    // at all despite NO catalogued (or live) `navigate` url pointing at it and no route
    // naming it. Both decisions are evidence-based:
    //
    //  - WHY IT MUST BE CATALOGUED: it is referenced only from application CODE —
    //    `group-view.page.ts:253` (`case 'files': return 'c-folder';`) hoists it as the
    //    context menu of the group view's "Dateien" segment, which renders
    //    `<okr-document-list contextMenuName="disable">` and delegates the action sheet to
    //    the group toolbar. The wrapper-coverage test in `@okr/tenant-routes` structurally
    //    cannot see this: it walks `navigate` urls for `c-*` segments, and nothing here is
    //    a url or a route parameter. The live doc exists on `tenants: ['scs']` ONLY, so
    //    every other tenant's group "Dateien" tab already renders an empty action menu
    //    today — the exact p13 failure mode this catalogue exists to prevent. Same
    //    precedent as `c-yearlyevents` (`calevent`) and the five accounting wrappers
    //    (`finance`), both catalogued for the same reason.
    //  - WHY `document` AND NOT `folder`: all three children are dispatched by
    //    `DocumentList.onPopoverDismiss` (`document-list.ts:293-299`: `addFolder` →
    //    `store.addFolder()`, `addFiles` → toolbar label→input, `toggleFilter` → local
    //    signal). `FolderList.onPopoverDismiss` handles only `'add'` and is not rendered
    //    anywhere in the app. Placing it on `folder` would seed a wrapper into tenants that
    //    enable `folder` without `document` — where no screen ever renders it — and would
    //    key its visibility (`blockOwnersOfMenuKey`) to a block that owns no screen.
    { key: 'c-folder', name: 'c-folder', url: '', action: 'context', roleNeeded: 'registered', icon: 'help-circle', label: '', children: [
      { key: 'folder-add', name: 'folder-add', url: 'addFolder', action: 'call', roleNeeded: 'registered', icon: 'folder', label: 'Ordner hinzufügen' },
      { key: 'files-add', name: 'files-add', url: 'addFiles', action: 'call', roleNeeded: 'registered', icon: 'upload', label: 'Dateien hinzufügen' },
      { key: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle', roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen' },
    ] },
  ],
};

/**
 * `libs/folder/{data-access,feature,ui,util}` — the folder tree documents are filed into
 * (`FolderModel`, per-folder `membersMayUpload` permission, breadcrumb navigation). Owns
 * `folders` (`FolderCollection = 'folders'`, `folder.service.ts`); cross-checked against
 * `apps/functions/src/privacy/subject-data-map.ts:684` (`folders`, by `ownerKey`).
 *
 * JUDGEMENT CALL — kept as its OWN block rather than merged into `document`, and the
 * argument cuts both ways; recording both so a later reader does not have to redo it:
 *  - FOR MERGING (the honest case): this block ships NOTHING a tenant can see. No route
 *    (`app.routes.ts` has no `folder` path — grepped), no live `menuItems` doc of its own,
 *    and `FolderList` — its only list screen — is exported from `@okr/folder-feature` but
 *    imported by nobody (only `whiteboard-list.ts` mentions it, in a comment, as a
 *    structural precedent). The one live wrapper carrying folder actions (`c-folder`) is
 *    dispatched by `DocumentList`, so it sits on `document` above. A tenant enabling
 *    `folder` alone gets literally zero user-visible surface, and `document` already forces
 *    `folder` on through `dependsOn`.
 *  - FOR KEEPING IT SPLIT (what is implemented): (a) block ids are stable SKU keys other
 *    tasks in this series reference by name, and the brief specifies two; (b) `folders` is
 *    a distinct Firestore collection with its own retention/audit and its own privacy
 *    subject-data-map entry, and `collections` is what the later retention pass acts on —
 *    folding it into `document`'s array would work, but loses the 1:1 domain↔block mapping
 *    the completeness test is built on; (c) three domains outside `libs/document` reach
 *    `FolderService`/`canManageFolders` DIRECTLY rather than through `DocumentService` —
 *    `cms/section`'s `rag-section.store.ts:17`, `subject/address`'s `addresses.store.ts:22`,
 *    `subject/group`'s `group-view.page.ts:10,16` — so `folder` is a real API surface of its
 *    own, not an implementation detail hidden behind `document`'s.
 *
 *    CORRECTED (fix round 1): (c) previously claimed those three consume `folder` WITHOUT
 *    `document`. That was FALSE, and the correction matters because this comment is the
 *    input to the repo owner's merge ruling. Swept every file importing `@okr/folder-*`
 *    outside `libs/folder` and `libs/document`: there are exactly THREE, and all three ALSO
 *    import `@okr/document-*` in the same file — `rag-section.store.ts:15-16`
 *    (`DocumentService`, `buildDocumentModel`), `addresses.store.ts:21` (`DocumentService`),
 *    `group-view.page.ts:15,19` (`getDocumentStoragePath`, `DocumentList`). The number of
 *    consumers of `folder` without `document` is ZERO. So (c) is about API COUPLING (who
 *    calls what), NOT about `folder` being independently usable — it is not, and the
 *    FOR-MERGING case above is correspondingly stronger than the original wording implied.
 * Raised with the controller rather than acted on unilaterally — see the task report.
 *
 * NO `activity` EDGE IS OWED — a TODO claiming one used to sit here and was removed in task 17
 * fix round 1. `folder.service.ts:11` does import `ActivityService` from
 * `@okr/activity-data-access`, but all it does with it is `activityService.log('folder', …)`
 * at lines 36/47/54 — audit-trail writes whose effect is invisible on this block's own
 * surface. No route and no menu row of `folder`'s breaks without `activity`, so under the
 * settled dividing line that is the "no edge" case (same as `finance` and `chat`). Nothing is
 * pending here for task 18.
 */
const folder: FeatureBlock = {
  id: 'folder',
  bundle: 'documents',
  label: '@tenant/util.feature.folder.label',
  icon: 'folder',
  defaultAvailability: 'ga',
  dependsOn: [],
  collections: ['folders'],
  // No route and no live `menuItems` doc of its own — see the block comment above. The one
  // live wrapper that carries folder ACTIONS (`c-folder`) is rendered and dispatched by
  // `DocumentList`, so it is catalogued on the `document` block, not here.
  menu: [],
};

/**
 * `libs/chat/{data-access,feature,ui,util}` — the club chat, backed by a HOSTED MATRIX
 * homeserver (etke.cc), not by Firestore. `MatrixChatService` talks to `matrix-js-sdk`
 * directly and swaps a Firebase ID token for Matrix credentials through the
 * `apps/functions/src/matrix-simple/*` callables.
 *
 * NO ROUTE OF ITS OWN — verified, not assumed. `app.routes.ts` has no `chat` path and
 * imports no `@okr/chat-*` lib. The chat SCREEN is a CMS page: the live `chat` menu doc
 * navigates to `/private/chat/contextMenuChat`, i.e. cms's `private/:id/:contextMenuName`
 * route → `PageDispatcher` → `page.dispatcher.ts:53` `@case ('chat')` → `ChatPage`
 * (`libs/cms/page/feature/chat.page.ts`) → `MatrixChat` (`@okr/chat-feature`). So this
 * block's `FEATURE_ROUTES` entry is `routes: () => []` and its menu url resolves against the
 * `cms` block's route table. That is also why it declares no dependency on `cms`: `cms` is
 * `core: true`, hence unconditionally effective, and no block in this catalogue declares a
 * core dependency (same convention as the `document` block's `avatar`/`cms` note).
 *
 * `contextMenuChat` IS CATALOGUED HERE AND THE TEST CANNOT SEE IT. Three independent reasons
 * it must be, none of which the wrapper-coverage test in `@okr/tenant-routes` can catch —
 * that test walks `navigate` urls looking for segments starting with `c-`, and this doc's
 * name does not carry the `c-` prefix at all (same naming-outlier class as `forms-context`
 * below and `ocr-rule-context` on `finance`):
 *  1. it is the `:contextMenuName` segment of the live `chat` doc's own url;
 *  2. `page.dispatcher.ts:161` HOISTS it in component code as the default whenever the route
 *     carries no `:contextMenuName` (`case 'chat': return this.contextMenuName() ??
 *     'contextMenuChat'`) — the same class of code-hoisted wrapper as `c-folder` on the
 *     `document` block (task 16);
 *  3. `group-view.page.ts` reaches it through that same hoist for the group's "Chat" segment —
 *     which is why the `subject` block CO-DECLARES this same wrapper (field-identical) in its
 *     own `menu` rather than depending on `chat`. See the note there; the two copies must be
 *     kept in step.
 * The live doc is on `tenants: ['scs']` ONLY (its two children `chat-room-add`/
 * `chat-room-edit` likewise), so every other tenant's chat room menu is empty TODAY. That is
 * the exact p13 failure mode this catalogue exists to close, and cataloguing it closes it.
 *
 * WHO REACHES INTO CHAT, AND WHO DECLARES AN EDGE. Exactly 14 files outside `libs/chat` import
 * a `@okr/chat-*` lib (re-derived, fix round 1 — the first pass said "nine", which was simply
 * miscounted): 11 non-spec files under `libs/`, 2 `.spec.ts` files (`menu.store.spec.ts`,
 * `section.store.spec.ts`), and `apps/scs-app/src/app/app.config.ts:142`. NOBODY declares an
 * edge to `chat`; read this list together with the comments on the blocks named, none of which
 * tells the whole story alone:
 *  - `subject` — does NOT declare an edge; CO-DECLARES `contextMenuChat` instead. Its group
 *    view embeds `PageDispatcher` (core), not a chat component, so only a menu doc crosses the
 *    boundary. `person.store.ts:425` additionally navigates to the chat page, which is cms's
 *    route. Full argument on that block.
 *  - `relationship` — does NOT (navigates to `/private/chat/c-contentpage`, i.e. cms's own
 *    always-on wrapper).
 *  - `calevent` — does NOT (`sendMessage` only, no screen, no menu doc).
 *  - `cms` (`page`, `section`, `menu` subdomains) — `core: true`, so by the settled convention
 *    it never declares a non-core edge; note `cms/page` is the block that physically renders
 *    `MatrixChat`.
 *  - `aoc` — does NOT: `aoc-chat.ts`/`aoc-chat.store.ts` use `@okr/chat-util` helpers and
 *    `MatrixMediaService` to build `aoc`'s OWN admin screen (`/aoc/chat`, still listed in the
 *    TODO on that block). It renders nothing of chat's surface and needs no doc catalogued
 *    here.
 * (`avatar` is deliberately NOT in this list — fix round 1 corrected a reversed direction. No
 * `libs/avatar/**` file imports `@okr/chat-*`; the import runs the other way, see below.)
 *
 * `dependsOn: []`. `matrix-chat.service.ts:14` imports `ActivityService`
 * (`@okr/activity-data-access`) for audit-trail writes and `libs/chat/feature` imports
 * `@okr/avatar-data-access`; neither is an edge under the settled dividing line — `avatar` is
 * core, and `ActivityService.log` is a write whose effect is invisible on chat's own surface
 * (no screen and no menu row of chat's breaks without it). Fix round 1: that reading has since
 * been adopted as the convention, and the correspondingly over-broad `activity` TODOs on
 * `finance` and `folder` were removed.
 *
 * PRIVACY — checked, not fixed (task 17 gate): chat transfers personal data (identity,
 * message content, avatars) to a third party, and it IS already registered:
 * `PROCESSOR_CATALOGUE` (`libs/security/processing/util/.../processor-catalogue.ts`) carries
 * `key: 'matrix'` — etke.cc / Etke Lda (PT), role `processor`, `transferMechanism:
 * 'adequacyDecision'`, `dpaUrl: ''` (deliberately empty; the register's check 5 reports the
 * gap). No entry was added or invented. ONE COUPLING WORTH A DECISION, reported not acted
 * on: that entry's `enabledWhen` is `byIntegration('matrix')`, i.e. it keys off
 * `app-config.integrations.matrix`, NOT off this block being enabled — so a tenant can end up
 * with the `chat` block on and Matrix missing from its Bearbeitungsverzeichnis, or vice
 * versa. Wiring the two together is a `security` change, out of scope for a cataloguing task.
 *
 * `defaultAvailability: 'ga'` PER THE TASK BRIEF, and flagged rather than decided: this is
 * the one block in the catalogue whose operation requires a self-hosted external server, a
 * per-tenant Matrix account namespace and a signed processor relationship that does not yet
 * have a DPA. `'internal'` is a defensible alternative and the repo owner should rule — see
 * the task-17 report.
 */
const chat: FeatureBlock = {
  id: 'chat',
  bundle: 'communication',
  label: '@tenant/util.feature.chat.label',
  icon: 'chatbubbles',
  defaultAvailability: 'ga',
  dependsOn: [],
  // Genuinely empty: rooms, memberships, messages, receipts and polls all live on the Matrix
  // homeserver. Verified three ways — no `*Collection` constant from `@okr/shared-models` is
  // referenced anywhere under `libs/chat`; the `matrix-simple` Cloud Functions READ
  // collections other blocks own (`users`, `persons`, `avatars`, `groups`, memberships) and
  // write back only `groups.matrixRoomId` (`matrix-simple/shared.ts:465`, a room-id cache on
  // a `subject`-owned doc — fix round 1: the first pass said "only READ", which was false)
  // plus the `users/{uid}/fcmTokens` subcollection; and `apps/functions/src/privacy/
  // subject-data-map.ts` has no chat entry at all — consistent with the processor entry's own
  // `memberNoticeDe`, which warns members that a deletion request cannot reach chat content.
  // Writing one field onto another block's collection does not make it chat's: `collections`
  // records OWNERSHIP, and `groups` is owned (and retention-governed) by `subject`.
  collections: [],
  menu: [
    // Live root child of BOTH `main_scs` and `main_test` (not nested under any submenu), on
    // all 16 tenants — mirrored as a top-level `navigate` spec accordingly.
    { key: 'chat', name: 'chat', url: '/private/chat/contextMenuChat', action: 'navigate', roleNeeded: 'registered', icon: 'chatbubbles', label: 'Chat' },
    // Not named `c-…`; see the long note above for why the wrapper-coverage test structurally
    // cannot reach this one and why it must be catalogued regardless. CO-DECLARED, verbatim,
    // on the `subject` block as well (the group view's "Chat" segment hoists this key) — the
    // supported shared-declaration pattern, folded into one Firestore write by
    // `planMenuOpsForBlocks`. Keep the two copies field-identical; the cross-block identity
    // test in `feature-catalogue.completeness.spec.ts` enforces it.
    { key: 'contextMenuChat', name: 'contextMenuChat', url: '', action: 'context', roleNeeded: 'admin', icon: 'help-circle', label: '', children: [
      { key: 'chat-room-add', name: 'chat-room-add', url: 'addRoom', action: 'call', roleNeeded: 'admin', icon: 'add-circle', label: 'Chat Raum hinzufügen' },
      { key: 'chat-room-edit', name: 'chat-room-edit', url: 'editRoom', action: 'call', roleNeeded: 'admin', icon: 'edit', label: 'Chat Raum bearbeiten' },
    ] },
  ],
};

/**
 * `libs/social-feed/{data-access,feature,ui}` — a three-file, four-class stub: a
 * `SocialFeedService`, a `SocialFeedList`, a `SocialPost` presentational component and a
 * `social-feed.routes.ts`.
 *
 * IT IS NOT WIRED INTO ANYTHING TODAY, and every part of that claim was checked:
 *  - `app.routes.ts` has no `feed` (or `social`) path and imports no `@okr/social-feed-*` lib;
 *  - a grep for `@okr/social-feed` across all of `libs/` and `apps/` returns ZERO hits outside
 *    `libs/social-feed` itself — no component, no store, no route table consumes it;
 *  - its own `social-feed.routes.ts` exports a `routes` array (`/feed` → `SocialFeedList`)
 *    that no application registers;
 *  - `social-feed.service.ts` fetches `http://localhost:3333/api/feed` over plain
 *    `HttpClient` — a hard-coded dev-loopback URL, not a configured backend. There is no
 *    Firestore access and no `SocialPostCollection` in `@okr/shared-models` (only the
 *    `SocialPostModel` type), hence `collections: []`.
 * It is catalogued because the completeness test requires every `libs/<domain>/feature` to be
 * either a block or an explicit non-block, and because the brief names it as one of this
 * bundle's three domains. It is a real (if unfinished) product feature rather than
 * infrastructure, so `NON_BLOCK_DOMAINS` would be the wrong home.
 *
 * `defaultAvailability: 'disabled'` — DELIBERATE, RULED BY THE REPO OWNER on 2026-08-04, NOT
 * an oversight and NOT a kill-switch pulled after a regression. If you have landed here because
 * you found the only `disabled` block in the catalogue and wondered whether someone forgot to
 * flip it back: they did not. The ruling, in the owner's terms, was that this is a
 * not-yet-completed feature that is not really used and should not appear among the features a
 * tenant can select — the evidence above (no app route, zero importers, a hard-coded
 * `http://localhost:3333/api/feed`) is exactly why. FINISH THE FEATURE FIRST, THEN RAISE THE
 * VALUE — do not raise it to make a picker row appear.
 *
 * WHY `'disabled'` AND NOT `'internal'`, which is the more obvious choice for something
 * unfinished: `resolveAvailability` (`feature-rollout.util.ts:35-40`) short-circuits `'disabled'`
 * to `offered: false` for EVERYONE, whereas `'internal'` still offers the block to any tenant an
 * operator lists in a `feature-rollout/{blockId}` doc's `allowTenants`. The owner wants it
 * unselectable, not selectively available. A rollout doc can still override this later
 * (`:29` prefers `rollout.availability` over the catalogue default in BOTH directions), so the
 * value here is a default, not a lock — it is the right shape for "not ready yet".
 *
 * D-BB-10 INTERACTION, checked rather than assumed, because it is the one way a `disabled`
 * block could leak: `effectiveFeatures` (`:55-57`) treats a legacy config (`enabled ===
 * undefined`) as "every non-`internal` block", which by construction DOES put this block into
 * `requested` and, via `resolveWithDeps`, into `withDeps`. It is `wanted` at `:63` and then
 * dropped at `:64-65`, where the `resolveAvailability` gate returns `offered: false` off this
 * very default. So the block never reaches a tenant — but note the gate at `:65`, not the
 * `requested` filter at `:56`, is the ONLY thing standing between a `disabled` default and every
 * legacy tenant on first deploy. Nothing pinned that until task 17 fix round 2; two tests in
 * `feature-rollout.util.spec.ts` now do ("never surfaces a block whose CATALOGUE DEFAULT is
 * disabled…"). Do not "simplify" that filter to cover `disabled` too without reading them.
 */
const socialFeed: FeatureBlock = {
  id: 'social-feed',
  bundle: 'communication',
  label: '@tenant/util.feature.social-feed.label',
  icon: 'news',
  // Owner ruling 2026-08-04 — see the block comment above before changing this.
  defaultAvailability: 'disabled',
  dependsOn: [],
  collections: [],
  // No live `menuItems` doc under any feed-related name. Verified with TWO query shapes, per
  // the `c-yearlyevents` lesson: a name-equality `IN` query over
  // [feed, social-feed, c-feed, ...] returned zero hits, AND two ordered range scans of the
  // whole collection — every doc whose `name` sorts in ['f','g') and in ['s','t') — contain
  // no feed/social entry (the ['f','g') scan is also what confirms there is exactly one
  // `forms-all`/`forms-context`/`forms-add` doc each, below).
  menu: [],
};

/**
 * `libs/forms/{data-access,feature,ui,util}` — the form BUILDER (`FormDefinitionList`,
 * `FormBuilderEditor`, the field-type library) plus the renderer the CMS `form` section
 * embeds. A published form is submitted through the `submitForm` callable
 * (`apps/functions/src/forms/index.ts`), which spam-checks it, optionally encrypts file
 * uploads, and writes the record to the target named on the form definition.
 *
 * `dependsOn: []` — the judgement call, argued rather than assumed. `libs/forms` imports
 * nothing outside `@okr/shared-*` except `@okr/cms-menu-feature` (the `Menu` component in
 * `form-definition-list.ts`), and `cms` is `core: true`, so by the settled convention no edge
 * is declared for it. The interesting case is the SUBMISSION TARGET, which points OUT of this
 * block: `FORM_MAPPINGS` (`libs/forms/util/src/lib/form-mappings.ts`) currently has exactly
 * two entries, `applications.default` and `applications.junior`, and BOTH write into the
 * `applications` collection — which the `subject` block owns, and whose only screen is
 * `subject`'s `/applications` route. Not declared as an edge, because the criterion is
 * "X's own routes and menus are broken without Y's", and forms' are not: the builder, the
 * `/forms` list and the rendered CMS section all work standalone, and a form definition may
 * equally use the `kind: 'url'` target, which involves `subject` not at all. STATE THE
 * CONSEQUENCE PLAINLY instead of hiding it: a tenant that enables `forms` without `subject`
 * can publish an application form whose submissions land in `applications` with no screen in
 * the app able to read them. That is a product decision (should the mapping picker be gated
 * on the target block?), flagged in the task-17 report, not silently encoded here.
 *
 * The callable additionally READS `sections`/`formDefinitions`/`responsibilities` and writes
 * `tasks` and `activities` for the notification path — `responsibilities` belongs to
 * `relationship`, `tasks`/`activities` to the still-uncatalogued `task`/`activity` domains.
 * Those are Cloud-Function-side effects with no screen of forms' behind them, so they are
 * likewise not edges; noted so a later reader does not mistake the omission for an oversight.
 *
 * GUARD/MENU ROLE MISMATCH, reported not "fixed" (same class as `document-all` and
 * `addresses`): the live `forms-all` doc's `roleNeeded` is `contentAdmin`, but the `/forms`
 * route is guarded by `isAdminGuard` — and `hasRole` (`auth.util.ts`) does not satisfy
 * `admin` from `contentAdmin`. A contentAdmin-but-not-admin user therefore sees the
 * "Formulare" entry and is bounced by the guard: a UX dead end, not an access leak (the guard
 * is the stricter side). Copied verbatim per the mirror rule. Note the route fragment in
 * `@okr/tenant-routes` DOES correct that guard from app.routes.ts's uncalled `isAdminGuard`
 * to `isAdminGuard()` — see the comment there; today the uncalled factory enforces nothing,
 * so `/forms` is currently open to any authenticated user in the live app.
 */
const forms: FeatureBlock = {
  id: 'forms',
  bundle: 'communication',
  label: '@tenant/util.feature.forms.label',
  icon: 'form',
  defaultAvailability: 'ga',
  dependsOn: [],
  // `FormDefinitionCollection` = 'formDefinitions' (`@okr/shared-models`, used by
  // `form-definition.service.ts`) is the only collection the client touches.
  //
  // `rateLimits` has NO client-side reference and is listed deliberately, on the same
  // reasoning as `ocr-results` on the `finance` block: this array is what a later retention
  // pass acts on, and an omission there is data retained forever in silence. It is written
  // ONLY by `submitForm`'s `checkRateLimit` (`apps/functions/src/forms/index.ts:166` — the
  // sole reference to this name anywhere in the repo; the unrelated `_rateLimits` collection,
  // with a leading underscore, belongs to the PDF and public-API limiters). Each doc holds a
  // hashed IP and user agent plus an `expiresAt`, i.e. pseudonymised personal data with a
  // self-expiry — but the expiry is a field, not an enforced TTL policy, so it belongs on
  // forms' ledger rather than nobody's.
  //
  // Submission records themselves are NOT listed: they are written into whatever collection
  // the form definition's target names (today always `applications`, owned by `subject` — see
  // the block comment), so listing them here would claim ownership of another block's data.
  collections: ['formDefinitions', 'rateLimits'],
  menu: [
    // Verified live: `forms-all` is a CHILD of the shared `cms-menu` parent doc — its
    // `menuItems` array reads `[..., 'templates', 'forms-all', 'esign']`. Nested via
    // `cmsMenuParent()` accordingly, never top-level (rule 2: mirror the live TREE SHAPE).
    // Present on all 16 tenants.
    cmsMenuParent([
      { key: 'forms-all', name: 'forms-all', url: '/forms/all/forms-context', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'list', label: '@main.cms.forms' },
    ]),
    // The `:contextMenuName` wrapper `forms-all`'s own url points at. Not named `c-…`, so the
    // wrapper-coverage test does not see it either (same outlier class as `contextMenuChat`
    // above and `ocr-rule-context` on `finance`); catalogued explicitly. Verified live on all
    // 16 tenants: `action: context`, `roleNeeded: privileged`, exactly one child.
    { key: 'forms-context', name: 'forms-context', url: '', action: 'context', roleNeeded: 'privileged', icon: 'help-circle', label: '', children: [
      { key: 'forms-add', name: 'forms-add', url: 'add', action: 'call', roleNeeded: 'privileged', icon: 'add-circle', label: '@context.forms.add' },
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
  subject, relationship, vcard,
  resource, mobility,
  finance, esign, pdfTemplate,
  documentBlock, folder,
  chat, socialFeed, forms,
];
