# AOC (Admin Operations Console) Domain

## Overview

The AOC (Admin Operations Console) is a restricted administrative dashboard for privileged users and admins. It provides a collection of operational tools grouped into dedicated tabs/pages:

- **Data** — Bulk-fix Firestore documents, validate model integrity, and regenerate search indexes across all collections.
- **Content** — CMS health checks: find orphaned sections/menu items, detect dangling page-to-section or menu-to-sub-item references, and repair them interactively.
- **Roles** — Manage Firebase Auth accounts and application user roles: create accounts, reset/set passwords, update Firebase user profiles, impersonate users, and manage role assignments.
- **Statistics** — Trigger batch-update operations for derived statistics (competition levels, age/gender distribution, category-by-gender, member locations).
- **Chat** — Admin view of the Matrix homeserver: browse rooms, inspect members, rename rooms, add aliases, invite users, provision Matrix accounts, kick members, deactivate users.
- **Storage** — Inspect Firebase Storage: fetch metadata for a specific file path, calculate storage consumption for a directory (optionally recursive).
- **Tag** — Manage the `tags` Firestore collection: browse, create, edit, and delete tag documents and their comma-separated tag strings per model type.
- **User Accounts** — Cross-reference view of Firebase Auth accounts, application `UserModel` records, and `MembershipModel` entries; supports editing/deleting each tier independently.
- **Admin Ops** — Miscellaneous administrative queries: list IBANs, list over-age juniors, show membership-category changes by club/year, and toggle focus-event debug logging.
- **Doc** — Document-level admin operations (separate store `aoc-doc.store.ts`).
- **Email** — Email-related admin utilities (`aoc-email.ts`).

The AOC has no Firestore collection of its own — it operates on all other domain collections via `FirestoreService` and domain-specific services.

## Authorization

All AOC pages require the `admin` or `privileged` role, enforced via `hasRole(...)` guards in the UI and stores.

## Store Pattern

Each AOC tab has its own `signalStore` (`AocDataStore`, `AocContentStore`, `AocRolesStore`, `AocStatisticsStore`, `AocChatStore`, `AocStorageStore`, `AocTagStore`, `AocUserAccountStore`, `AocAdminOpsStore`) provided at the component level (not root). All stores inject `AppStore` and `FirestoreService`.

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
- `fixModels()` — Bulk-patch documents in any collection (dry-run mode supported). Developer configures collection name and field corrections directly in the method.
- `validateModels()` — Run vest validation suites over all documents in a collection and log validation errors.
- `createIndexesOnCollection()` — Regenerate the `index` field on every document in a collection using domain-specific index functions.
- `fixUndefinedFields<T>()` / `fixTypes<T>()` — Utility methods for coercing field types during fix operations.

### AocContentStore
- `findOrphanedSections()` — Lists sections not referenced by any page, accordion item, or `linkedSection`.
- `findMissingSections()` — Lists page→section references where the section document does not exist.
- `findOrphanedMenus()` — Lists menu items not referenced by any parent menu.
- `findMissingMenus()` — Lists sub-menu references pointing to non-existent menu items.
- `editSection()` / `removeSection()` / `createMissingSection()` / `removeSectionRefFromPage()` — Repair actions on orphaned/missing sections.
- `editMenu()` / `removeMenu()` / `addMissingMenu()` / `removeMissingMenuRef()` — Repair actions on orphaned/missing menu items.

### AocTagStore
- Reads from collection: `tags` (field `tagModel`, `tags` as comma-separated string).
- Supports full CRUD on tag documents and individual tag string items.

### AocChatStore
- Interfaces with the Matrix homeserver admin API (via `MatrixChatService`).
- Provides room listing, member listing, room rename/alias/invite/delete, user provisioning, member kick/deactivate.

## Library Path

`@bk2/aoc-feature` (`libs/aoc/feature/src/lib/`)

Utilities: `@bk2/aoc-util` (`libs/aoc/util/src/`) — exports `adminops.util` and `statistics.util`.
