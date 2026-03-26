# Transfer Domain

## Overview

The `Transfer` entity models the transfer of ownership or value between entities — covering financial accounting transactions (debit/credit), purchases, gifts, inheritances, and bank withdrawals or deposits. It can reference multiple subjects (payers/senders), multiple objects (recipients), and a single resource (what is being transferred).

## Firestore Collection

Collection name: `transfers`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `tags` | string | Comma-separated tags |
| `name` | string | Display name / reason for the transfer (e.g. `xmas` for a gift) |
| `notes` | string | Internal notes |
| `subjects` | AvatarInfo[] | List of subject entities (persons, orgs, or accounts) — the paying/sending side |
| `objects` | AvatarInfo[] | List of object entities (persons, orgs, or accounts) — the receiving side |
| `resource` | AvatarInfo | The resource being transferred (e.g. rowing boat, account) |
| `dateOfTransfer` | StoreDate | Date the transfer occurred |
| `type` | string | Transfer type key (e.g. `sale`, `purchase`, `gift`, `inheritance`) — from `transfer_type` category |
| `state` | string | Transfer state key (e.g. `active`, `pending`, `cancelled`) — from `transfer_state` category |
| `label` | string | Custom label for non-standard transfer types |
| `price` | number | Monetary amount |
| `currency` | string | ISO 4217 currency code (e.g. `CHF`) |
| `periodicity` | string | Payment periodicity key (e.g. `once`, `monthly`) — from `periodicity` category |

## Transfer Types

Configured via the `transfer_type` category list. Typical values include:

| Type | Description |
| --- | --- |
| `sale` | Sale (seller → buyer) |
| `purchase` | Purchase |
| `gift` | Gift |
| `inheritance` | Inheritance |
| `withdrawal` | Withdrawal from an account |
| `deposit` | Deposit to an account |

## Store: `TransferStore`

An NgRx Signal Store managing all transfer data for a tenant.

**Key state fields:**

| Field | Description |
| --- | --- |
| `searchTerm` | Free-text filter on the index field |
| `selectedTag` | Tag chip filter |
| `selectedType` | Filter by transfer type |
| `selectedYear` | Year filter applied to `dateOfTransfer` |
| `selectedState` | Filter by transfer state |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `transfers` | All transfers loaded |
| `transfersCount` | Total count |
| `filteredTransfers` | Filtered by searchTerm, year, type, state, and tag |

**Key methods:**

| Method | Description |
| --- | --- |
| `add(readOnly)` | Creates a new `TransferModel` pre-filled with the current person and default resource, then opens the edit modal |
| `edit(transfer?, readOnly)` | Opens `TransferEditModalComponent` |
| `delete(transfer?, readOnly)` | Hard-deletes a transfer without confirmation dialog |
| `selectPersonAvatar()` | Opens a person-select dialog and returns the selected `AvatarInfo` |
| `selectResourceAvatar()` | Opens a resource-select dialog and returns the selected `AvatarInfo` |

## Components

### `TransferEditModalComponent`

An Ionic modal for creating or editing a `TransferModel`. Receives `transfer`, `currentUser`, `types`, `states`, `periodicities`, `tags`, `tenantId`, `readOnly`.

### `TransferListComponent`

A standalone list view of transfers with filters for type, state, year, and tags.
