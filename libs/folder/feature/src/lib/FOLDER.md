# Folder Domain

## Overview
The Folder domain provides hierarchical grouping of `DocumentModel` records. A `FolderModel` stores its ancestor keys in `parents`, enabling arbitrary nesting. The document-to-folder relationship is many-to-many: a `DocumentModel` holds an array of `folderKeys` referencing one or more folders.

A `FolderModel` is implicitly created with `bkey = groupKey` the first time a group's files are accessed (GroupView convention). Folders can also be created explicitly via the admin list or from within `DocumentStore.addFolder()`.

## Firestore Collection
Collection name: `folders`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `name` | string | Display name of the folder |
| `description` | string | Human-readable notes |
| `title` | string | Short title |
| `parents` | string[] | `FolderModel` bkeys of ancestor folders; empty for root folders |
| `tags` | string | Comma-separated tags |
| `index` | string | Search index string |

## Hierarchy Model
- A folder with an empty `parents` array is a root folder.
- A folder with one entry in `parents` is a direct child of that parent.
- Multiple entries in `parents` allow a folder to appear under several parents (DAG structure).
- Child folders of a given parent are queried via `FolderService.listByParent(parentKey)`.

## State (FolderStore)
The `FolderStore` (NgRx Signal Store) holds:
- `folderKey` — key of the single folder being viewed
- `searchTerm` — text filter applied to `folder.index`
- `foldersResource` — full tenant folder list ordered by `name`
- `folderResource` — single folder stream keyed by `folderKey`

Notable store actions:
- `add()` — creates a new empty `FolderModel` and opens the edit modal
- `edit(folder, readOnly)` — opens `FolderEditModalComponent`; creates or updates on confirm
- `delete(folder)` — confirmation-guarded deletion

## Key Components
| Component | Selector / Role |
|---|---|
| `FolderListComponent` | Admin list view with search filter and CRUD |
| `FolderEditModalComponent` | Edit/view modal for a single folder |

## Data Access
`FolderService` (`@bk2/folder-data-access`) is the Firestore gateway:
- `list()` — real-time stream of all folders for the tenant
- `read(key)` — real-time stream for a single folder
- `listByParent(parentKey)` — real-time stream of direct child folders
- `create / update / delete` — write operations

`FolderStore` also uses `FirestoreService` directly to query with a system query (all-tenant filter) ordered by `name`.

## Integration with DocumentStore
`DocumentStore` uses the `f:<folderKey>` listId prefix to filter documents by folder. When `DocumentStore.addFolder()` is called, it creates a new `FolderModel` nested under the current folder and immediately navigates into it by updating `listId`. The `subfoldersResource` in `DocumentStore` provides the child folder list for breadcrumb/navigation rendering.
