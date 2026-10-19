# AOC (Admin Operations Console) Domain

## Overview

The AOC (Admin Operations Console) is a restricted administrative dashboard for privileged users and admins. It provides a collection of operational tools grouped into dedicated tabs/pages:

- **Data** — Validate model integrity and regenerate search indexes across all collections. There is no Daten-Korrektur page any more; bulk fixes run as a local script (see below).
- **Content** — moved to Seiten › Integrität prüfen (`/page/integrity`, `@okr/cms-page-feature`); `/aoc/content` redirects there.
- **Roles** — Manage Firebase Auth accounts and application user roles: create accounts, reset/set passwords, update Firebase user profiles, impersonate users, and manage role assignments.
- **Chat** — Admin view of the Matrix homeserver: browse rooms, inspect members, rename rooms, add aliases, invite users, provision Matrix accounts, kick members, deactivate users. The group-membership repairs (members, post policy, guests) moved to Gruppen › Wartung (`c-groups`); this page keeps only a read-only drift scan for its room-list badge.
- **Tag** — Manage the `tags` Firestore collection: browse, create, edit, and delete tag documents and their comma-separated tag strings per model type.
- **User Accounts** — Cross-reference view of Firebase Auth accounts, application `UserModel` records, and `MembershipModel` entries; supports editing/deleting each tier independently.
- **Admin Ops** — Miscellaneous administrative operations: the IBAN list and `backfillAccountTenants` (both move in spec 1.101 phase 5). The over-age-juniors and membership-category-change reports left in phase 3 (see below). No Debug Tools (removed, spec 1.101).
- **SRV / Regasoft** — moved to Mitglieder › Wartung › Verbandsabgleich (SRV) (`/membership/srv`, `@okr/relationship-membership-feature`, memberAdmin, not restricted to scs); `/aoc/srv` redirects there.
- **Bexio** — the account, journal, invoice and bill syncs, the vendor/receiver linking and «clear tree» are retired from the UI (the Cloud Functions stay deployed; `syncBexioAccounts` requires admin). The contact reconciliation moved to Personen › Wartung › Bexio-Kontakte (`/person/bexio-contacts`, `@okr/subject-person-feature`, admin); `/aoc/bexio` redirects there.
- **Statistik** — deleted (it queried fields that do not exist and duplicated the `member-age` section).
- **Year-end membership reports** (Umzuteilende Jugendliche, Änderungen Mitgliederkategorie) — moved to Mitglieder › Wartung (`@okr/relationship-membership-feature`, memberAdmin); they report on the org of the open list.
- **Kiosk** — moved to Logbuch › Kiosk-Geräte (`/trips/kiosk`, `@okr/trip-feature`, admin); `/aoc/kiosk` redirects there. Monitoring and remote control of the tenant's kiosk tablets are described in the `kiosk` skill.
- **Doc** — moved to Dokumente › Verwaiste Dateien (`/document/orphans`, `@okr/content-document-feature`); `/aoc/doc` redirects there.
- **Email** — «E-Mail-Ereignisse» (`aoc-email.ts`): the delivery/bounce events of outgoing mail, with its own menu row (`aoc-email` → `/aoc/email`).
- **Trip** — moved to Logbuch › Logbuch aufräumen (`/trips/maintenance`, `@okr/trip-feature`, tripAdmin); `/aoc/trip` redirects there.
- **Diary** — moved to Tagebuch › Import vorbereiten (`/diary/import`, `@okr/content-diary-feature`); `/aoc/diary` redirects there.

There is no Storage page (removed, spec 1.101). Flight Tracker is not an AOC tool: it is a main-menu entry (block `mobility`).

The AOC has no Firestore collection of its own — it operates on all other domain collections via `FirestoreService` and domain-specific services.

## Authorization

All AOC pages require the `admin` or `privileged` role, enforced via `hasRole(...)` guards in the UI and stores.

## Store Pattern

Each AOC tab has its own `signalStore` (`AocDataStore`, `AocRolesStore`, `AocChatStore`, `AocTagStore`, `AocUserAccountStore`, `AocAdminOpsStore`) provided at the component level (not root). All stores inject `AppStore` and `FirestoreService`.

## Supported Model Types (Data / Validate / Index operations)

The `AocDataStore` supports operations over the following collections:

| Model Type | Collection |
|---|---|
| `address` | `addresses` |
| `calevent` | `calevents` |
| `comment` | `comments` |
| `document` | `documents` |
| `group` | `groups` |
| `location` | `locations` |
| `membership` | `memberships` |
| `menuitem` | `menu-items` |
| `org` | `orgs` |
| `ownership` | `ownerships` |
| `page` | `pages` |
| `person` | `persons` |
| `personal_rel` | `personal-rels` |
| `reservation` | `reservations` |
| `resource` | `resources` |
| `todo` | `tasks` |
| `transfer` | `transfers` |
| `user` | `users` |
| `workrel` | `workrels` |
| `category` | `categories` |

## Key Capabilities

### AocDataStore

- `validateModels()` — Run vest validation suites over all documents in a collection and log validation errors.
- `createIndexesOnCollection()` — Regenerate the `index` field on every document in a collection using domain-specific index functions.
- Bulk fixes (types, missing fields, one-off migrations) are no longer in the UI: use the local script `node scripts/fix-models.mjs --collection <name> [--max <n>] [--apply]` (dry run by default; configure `DEFAULTS`/`TYPE_SPEC`/`CUSTOM` at its top).

### AocTagStore

- Reads from collection: `tags` (field `tagModel`, `tags` as comma-separated string).
- Supports full CRUD on tag documents and individual tag string items.

### AocChatStore

- Interfaces with the Matrix homeserver admin API (via `MatrixChatService`).
- Provides room listing, member listing, room rename/alias/invite/delete, user provisioning, member kick/deactivate.

## Mandanten-Zuteilung (operator only)

Operator-only since spec 1.101 §6: route `/operator/allocation` exists only in `apps/bka-app`; `allocateTenant` and `getAllocationEmails` refuse every tenant but `bka` (`checkOperatorTenant`). `listFirebaseUsers` / `listBkUsers` return the whole project only to bka, the caller's own tenant otherwise.

- Operator = the caller's `users` doc has tenants exactly `['bka']` AND `roles.admin` is true (`getCallerContext().isOperator`, `isOperatorUserData`) — never `tenants[0]`, never the custom claim.
- Outside bka, impersonation (`createCustomToken`), `getFirebaseUser`, `getUidByEmail`, `setPassword`, `updateFirebaseUser` and `deleteFirebaseAuthUser` act only on logins whose `users` doc belongs to the caller's tenant alone (`loadTenantUser` / `isSoleTenantUserData` / `mayDeleteAuthUser`).
- `firestore.rules` (users): a `users` doc holds exactly one tenant; admins create only docs of their own single tenant, never change `tenants`, and update/delete only docs of their own tenant.

## Library Path

`@okr/aoc-feature` (`libs/aoc/feature/src/lib/`)

Utilities: `@okr/aoc-util` (`libs/aoc/util/src/`) — exports `adminops.util`.
