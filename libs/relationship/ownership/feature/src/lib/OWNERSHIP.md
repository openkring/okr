# Ownership Domain

## Overview

The `Ownership` entity models the relationship between a person or organisation and a resource (e.g. a rowing boat, a locker, a key, a storage place). It supports different ownership types such as possession, usage, rent, and lease, and can be time-bounded with `validFrom`/`validTo` dates.

## Firestore Collection

Collection name: `ownerships`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `tags` | string | Comma-separated tags |
| `notes` | string | Internal notes / detailed description |
| `ownerKey` | string | Key of the owner (person or org) |
| `ownerName1` | string | First name (person) or company name part 1 (org) |
| `ownerName2` | string | Last name (person) or company name part 2 (org) |
| `ownerModelType` | `'person' \| 'org'` | Discriminator for the owner entity type |
| `ownerType` | string | Gender (for persons) or org type |
| `resourceKey` | string | Key of the owned resource |
| `resourceName` | string | Name of the resource (denormalized) |
| `resourceModelType` | `'resource' \| 'account'` | Discriminator for the resource entity type |
| `resourceType` | string | Category key for the resource type (e.g. `rboat`, `locker`, `key`) |
| `resourceSubType` | string | Sub-type of the resource (e.g. rowing boat sub-type) |
| `validFrom` | StoreDate | Start of the ownership period |
| `validTo` | StoreDate | End of the ownership period |
| `type` | string | Ownership category key (possession, usage, rent, lease) |
| `state` | string | Ownership state key (e.g. `active`, `applied`, `cancelled`) |
| `count` | number | How many units of the resource are owned |
| `order` | number | Waiting-list order (relevant when state is `applied`) |
| `price` | MoneyModel? | Optional price, overrides the default from the ownership category |

## Ownership Types

| Type | Description |
| --- | --- |
| Possession | The owner has full ownership of the resource |
| Usage | The owner has the right to use the resource |
| Rent | The owner rents the resource |
| Lease | The owner leases the resource |

## Store: `OwnershipStore`

An NgRx Signal Store that manages all ownership state for a tenant.

**Key state fields:**

| Field | Description |
| --- | --- |
| `ownerKey` | Key of the person or org whose ownerships are shown in an accordion |
| `ownerModelType` | `'person'` or `'org'` |
| `showOnlyCurrent` | When true, shows only ownerships with `validTo` in the future |
| `resourceKey` | Key of the resource (used to compute `owners`) |
| `searchTerm` | Free-text filter on the index field |
| `selectedOwnershipType` | Filter by ownership type |
| `selectedResourceType` | Filter by resource type |
| `selectedModelType` | Filter by owner model type (`person`, `org`, or `all`) |
| `selectedGender` | Filter persons by gender |
| `selectedOrgType` | Filter orgs by type |
| `selectedRowingBoatType` | Filter rowing boats by sub-type |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allOwnerships` | All ownerships, optionally filtered to current ones |
| `ownerships` | Ownerships belonging to the current `ownerKey` |
| `owners` | Distinct owner keys for the current `resourceKey` |
| `lockers` | Current locker-type ownerships |
| `keys` | Current key-type ownerships |
| `privateBoats` | Current rowing boat ownerships where owner is a person |
| `scsBoats` | Current rowing boat ownerships where owner is the `scs` org |
| `filteredAllOwnerships` | Full list filtered by search/tag/resource/owner type |
| `filteredLockers` / `filteredKeys` / `filteredPrivateBoats` / `filteredScsBoats` | Filtered sub-lists |

**Key methods:**

| Method | Description |
| --- | --- |
| `add(owner?, ownerModelType, resource?, readOnly)` | Opens `OwnershipNewModalComponent` pre-filled with owner/resource |
| `edit(ownership, readOnly)` | Opens `OwnershipEditModalComponent` |
| `end(ownership, readOnly)` | Picks a date and sets `validTo`, effectively ending the ownership |
| `delete(ownership?, readOnly)` | Confirms and hard-deletes an ownership |
| `setOwner(ownerKey, ownerModelType)` | Sets the accordion scope and reloads |

## Components

### `OwnershipListComponent`

A standalone list view showing all ownerships with filters for resource type, owner type, gender, org type, and rowing boat sub-type.

### `OwnershipEditModalComponent`

An Ionic modal for editing an existing `OwnershipModel`.

### `OwnershipNewModalComponent`

A compact modal (small-modal CSS class) for creating a new ownership, pre-filled from context (owner + resource).
