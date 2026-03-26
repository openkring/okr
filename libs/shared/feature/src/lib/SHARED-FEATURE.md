# Shared Feature Domain

## Overview

The `@bk2/shared-feature` library contains app-level cross-cutting state and selection utilities that are consumed by every feature in the application. It is the integration layer between Firebase, the environment configuration, and the rest of the domain feature libraries.

## AppStore

The root singleton NgRx Signal Store (`providedIn: 'root'`). It is the authoritative source for:

- Firebase Authentication state (via `rxfire/auth` `authState`)
- The currently authenticated application user (`UserModel`)
- Tenant-scoped reference data (persons, orgs, groups, resources, tags, categories)
- Application configuration (`AppConfig`)
- Derived global computed signals (auth state, roles, privacy settings, default org/resource)

### State

| State field | Type | Description |
|---|---|---|
| `tenantId` | string | Active tenant identifier (from `ENV` injection token) |
| `production` | boolean | Build mode flag |
| `useEmulators` | boolean | Firebase emulator flag |
| `firebase.*` | object | Firebase SDK configuration (apiKey, authDomain, etc.) |
| `services.*` | object | External service keys (reCAPTCHA, Google Maps, Imgix, NxCloud) |

### rxResource Bindings

| Resource | Description |
|---|---|
| `currentUserResource` | Queries `users` collection by `loginEmail` matching the authenticated Firebase user |
| `personsResource` | All `PersonModel` records for the tenant, ordered by `lastName` |
| `orgsResource` | All `OrgModel` records for the tenant, ordered by `name` |
| `groupsResource` | All `GroupModel` records for the tenant, ordered by `name` |
| `resourcesResource` | All `ResourceModel` records for the tenant, ordered by `name` |
| `tagsResource` | All `TagModel` records for the tenant, ordered by `tagModel` |
| `categoriesResource` | All `CategoryListModel` records for the tenant, ordered by `name` |
| `appConfigResource` | Single `AppConfig` document keyed by `tenantId` |

All resources only fire when both `fbUser` and `tenantId` are truthy (auth-gate).

### Key Computed Signals

| Signal | Description |
|---|---|
| `currentUser` | First `UserModel` matched by `loginEmail`; warns/errors on 0 or 2+ results |
| `allPersons` / `allOrgs` / `allGroups` / `allResources` / `allTags` / `allCategories` | Typed arrays of reference data |
| `appConfig` | `AppConfig` or a default instance |
| `defaultOrg` | Org whose `bkey === tenantId` |
| `defaultResource` | Resource matching `appConfig.defaultResourceId` |
| `privacySettings` | `PrivacySettings` object derived from `appConfig` |
| `currentPerson` | `PersonModel` matching `currentUser.personKey` |
| `isAuthenticated` | `fbUser !== null` |
| `firebaseUid` / `loginEmail` | Firebase Auth UID and email |
| `roles` | `currentUser.roles` |
| `showDebugInfo` | User or config-level debug flag |

### Key Methods

| Method | Description |
|---|---|
| `getPerson(key)` | Find a PersonModel in the pre-loaded reference data |
| `getOrg(key)` | Find an OrgModel |
| `getGroup(key)` | Find a GroupModel |
| `getResource(key)` | Find a ResourceModel |
| `getTags(modelType)` | Return comma-separated tag string for a model type from the `tags` collection |
| `getCategory(name)` | Return a `CategoryListModel` by name (throws if not found) |
| `getCategoryItem(name, itemName)` | Return a `CategoryItemModel` by category and item name |
| `getCategoryIcon(name, itemName)` | Return the icon name for a category item |
| `getDefaultIcon(modelType, type?, subType?)` | Return the default SVG icon name for a model/resource type |

### Firestore Collections Used

| Collection | Purpose |
|---|---|
| `users` | Current user lookup |
| `persons` | Reference data |
| `orgs` | Reference data |
| `groups` | Reference data |
| `resources` | Reference data |
| `tags` | Tag configuration per model type |
| `categories` | Category lists (enums, picklists) |
| `app-config` | Per-tenant application configuration |

## AppConfigService

Simple CRUD service for the `app-config` Firestore collection. The document key equals the `tenantId`. Used by `AppStore.appConfigResource`.

## AppConfig Model

Firestore collection: `app-config`

Key fields:

| Field | Description |
|---|---|
| `tenantId` | Document key; identifies the tenant |
| `appName` / `appTitle` / `appSubtitle` | Branding |
| `rootUrl` / `loginUrl` / `passwordResetUrl` | Navigation defaults |
| `locale` | Default locale (e.g. `'de-ch'`) |
| `opName` / `opEmail` / `opCity` etc. | Operator contact information |
| `ownerOrgId` / `ownerUserId` / `defaultResourceId` | Default model references |
| `showName` ... `showDocuments` | `PrivacyAccessor` values controlling visibility per role |
| `showDebugInfo` | App-wide debug flag |
| `useFaceId` / `useTouchId` | Biometric auth preferences |

## Select Stores

Re-usable, modal-ready NgRx Signal Stores for entity pickers. Each follows the same pattern:

- `rxResource` loads all entities filtered by tenantId and ordered by a sensible field.
- `searchTerm` and `selectedTag` state for client-side filtering.
- `filteredXxx` computed signal for the filtered list.

| Store | Entity | Collection | Import |
|---|---|---|---|
| `PersonSelectStore` | `PersonModel` | `persons` | `@bk2/shared-feature` |
| `OrgSelectStore` | `OrgModel` | `orgs` | `@bk2/shared-feature` |
| `GroupSelectStore` | `GroupModel` | `groups` | `@bk2/shared-feature` |
| `ResourceSelectStore` | `ResourceModel` | `resources` | `@bk2/shared-feature` |
| `CalendarSelectStore` | `CalendarModel` | `calendars` | `@bk2/shared-feature` |

Corresponding modals (`PersonSelectModal`, `OrgSelectModal`, etc.) wrap the store in a searchable list with tag filtering.

## ModelSelectService

Convenience service (`@bk2/shared-feature`) that opens any selection modal and returns a typed result. Used across feature stores to pick persons, orgs, groups, resources, or calendars without duplicating modal-creation boilerplate.

## Library Path

`@bk2/shared-feature` (`libs/shared/feature/src/lib/`)
