# Responsibility Domain

## Overview

The `Responsibility` entity models who is responsible for a named function within the organisation. Each record names the responsible person or group, an optional temporary delegate, and the validity period. The `bkey` is user-defined (e.g. `president`, `treasurer`, `boat_comm`) so that other parts of the system can reference a responsibility by a well-known key.

## Firestore Collection

Collection name: `responsibilities`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | User-defined Firestore document ID (e.g. `president`, `keys`, `infra_rental`). Stripped on write, re-attached on read. |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `name` | string | Human-readable description of the responsibility (e.g. `Clubareal Vermietung`) |
| `notes` | string | Internal notes |
| `responsibleAvatar` | AvatarInfo? | The person or group who holds the responsibility |
| `delegateAvatar` | AvatarInfo? | Optional temporary substitute (person or group) |
| `delegateValidFrom` | StoreDate | Start of the delegation period |
| `delegateValidTo` | StoreDate | End of the delegation period |
| `validFrom` | StoreDate | Start of the responsibility |
| `validTo` | StoreDate | End of the responsibility |

## Delegation Logic

When a `delegateAvatar` is set and the current date falls within `[delegateValidFrom, delegateValidTo]`, the delegate is considered active and takes precedence over `responsibleAvatar`. The `isDelegateActive()` utility function checks this condition.

`getResponsibleFor()` resolves the effective responsible for a given responsibility key, returning the delegate (if active) or the primary responsible otherwise.

## Well-Known Responsibility Keys

Examples of user-defined `bkey` values used in the SCS context:

| bkey | Description |
| --- | --- |
| `president` | President |
| `treasurer` | Treasurer / Kassier |
| `board` | Board / Vorstand |
| `boat_comm` | Boat Commission / Bootskommission |
| `keys` | Key management / Schlüsselverwaltung |
| `infra_rental` | Infrastructure rental / Clubareal Vermietung |
| `admission_a` | Membership administration (active) |
| `course_k` | Beginner courses |
| `course_j` | Youth courses |

## Store: `ResponsibilityStore`

An NgRx Signal Store managing all responsibilities for a tenant.

**Key state fields:**

| Field | Description |
| --- | --- |
| `listId` | Filter format: `k_<bkey>`, `r_<responsibleKey>`, or `all` |
| `showOnlyCurrent` | When true, shows only responsibilities currently valid (via `isValidAt`) |
| `searchTerm` | Free-text filter on the index field |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allResponsibilities` | All responsibilities loaded |
| `currentResponsibilities` | Responsibilities currently valid (based on `validFrom`/`validTo`) |
| `responsibilities` | Filtered by `showOnlyCurrent` |
| `filteredResponsibilities` | Applies `listId` prefix filter plus `searchTerm` |

**List ID Prefixes:**

| Prefix | Filters by |
| --- | --- |
| `k_` | `bkey` (exact match) |
| `r_` | `responsibleAvatar.key` or `delegateAvatar.key` |
| `all` | No filter |

**Key methods:**

| Method | Description |
| --- | --- |
| `add(readOnly)` | Creates an empty `ResponsibilityModel` and opens the edit modal in new mode |
| `edit(responsibility, isNew)` | Opens `ResponsibilityEditModal`; on create checks for duplicate bkeys |
| `delete(responsibility?, readOnly)` | Confirms and hard-deletes a responsibility |
| `setListId(listId)` | Sets the list filter and reloads |
| `setShowMode(showOnlyCurrent)` | Toggles current/all view |
| `setSearchTerm(searchTerm)` | Sets the free-text search filter |

## Components

### `ResponsibilityEditModal`

An Ionic modal for creating or editing a `ResponsibilityModel`. When creating (`isNew = true`), the `bkey` is entered by the user; the store checks for duplicates before saving.

### `ResponsibilityListComponent`

A standalone list view of responsibilities with search and current/all toggle.

### `ResponsibilityAccordionComponent`

An accordion for embedding the responsibility list within a subject detail page (e.g. an org detail page).
