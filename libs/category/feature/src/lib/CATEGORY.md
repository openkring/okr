# Category Domain

## Overview
The Category domain provides a dynamic, database-driven enumeration system used throughout the application. Instead of hard-coded TypeScript enums, selectable option lists (e.g. page types, section types, membership states, document types, roles) are stored as `CategoryListModel` documents in Firestore. This allows administrators to adjust labels, add items, and configure pricing per category without a code change.

A `CategoryListModel` contains metadata plus an ordered list of `CategoryItemModel` entries. The `AppStore` loads all categories at startup and exposes them via `getCategory(name)`. Components and stores call `getCategory('section_type')`, `getCategory('page_type')`, etc. to populate their dropdowns.

## Firestore Collection
Collection name: `categories`

## CategoryListModel Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `name` | string | Internal identifier, matches the key used in `getCategory()` calls (e.g. `section_type`, `page_type`) |
| `index` | string | Search index string |
| `tags` | string | Comma-separated tags for filtering |
| `i18nBase` | string | i18n key prefix; items are translated as `@<i18nBase>.<itemName>.label` when `translateItems` is `true` |
| `translateItems` | boolean | If `true`, item labels are looked up via Transloco; otherwise `name` is displayed as-is |
| `notes` | string | Human-readable description of the category list |
| `items` | CategoryItemModel[] | Ordered list of selectable items |

## CategoryItemModel Field Semantics
| Field | Type | Description |
|---|---|---|
| `name` | string | The stored value (e.g. `article`, `draft`, `CHF`) |
| `abbreviation` | string | Short code / abbreviation |
| `icon` | string | Ion-icon name for this item |
| `state` | string | Item state (e.g. `active`, `inactive`) |
| `price` | number | Optional price associated with the item (e.g. for membership fees) |
| `currency` | string | Currency code (e.g. `CHF`) |
| `periodicity` | string | Billing periodicity (e.g. `yearly`, `monthly`) |

## State (CategoryStore)
The `CategoryStore` (NgRx Signal Store) holds:
- `searchTerm` — text filter applied to `cat.index`
- `selectedTag` — tag chip filter
- `categoriesResource` — live Firestore stream of all categories for the tenant

Notable store actions:
- `add()` — creates a new empty `CategoryListModel` and opens the edit modal
- `edit(category)` — opens `CategoryEditModalComponent`; creates or updates on confirm
- `delete(category)` — deletes without additional confirmation prompt

## Key Components
| Component | Selector / Role |
|---|---|
| `CategoryListComponent` | Admin list view with search/tag filters and CRUD action sheet |
| `CategoryEditModalComponent` | Edit/view modal for a single category list and its items |

## Data Access
`CategoryService` (`@bk2/category-data-access`) is the Firestore gateway:
- `list()` — real-time stream of all category lists for the tenant
- `create / update / delete` — write operations

## Usage Pattern
```
// In a store or component:
const types: CategoryListModel = this.appStore.getCategory('section_type');
// Bind to an ion-select with items = types.items
```
Category names used across the codebase include: `section_type`, `page_type`, `content_state`, `menu_action`, `role`, `roles`, `document_type`, `document_source`, `membership_state`, and others.
