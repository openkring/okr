# Document Domain

## Overview
The Document domain manages files stored in Firebase Storage and tracked in Firestore. A `DocumentModel` represents any file: images, PDFs, spreadsheets, videos, or any binary. Documents can be organized into `FolderModel` hierarchies (many-to-many: a document can belong to multiple folders). The domain supports version chains (`priorVersionKey`), external URLs, and automatic metadata derivation from uploaded files.

The `DocumentStore` provides a rich list view with multiple filter dimensions (`listId`, `type`, `source`, `tag`, `searchTerm`). The `listId` prefix determines which subset of documents to show:
- `p:<path>` — all documents whose `fullPath` starts with the given path
- `t:<tag>` — all documents tagged with the given tag
- `f:<folderKey>` — all documents belonging to a specific folder

## Firestore Collection
Collection name: `docs`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Search index string |
| `tags` | string | Comma-separated tags |
| `folderKeys` | string[] | `FolderModel` bkeys this document belongs to (many-to-many) |
| `fullPath` | string | Firebase Storage path: `{/dir}/baseName.extension` |
| `description` | string | Human-readable, translatable file name |
| `title` | string | Short display title |
| `altText` | string | Accessible alt text (primarily for images) |
| `type` | string | Document category (e.g. `marketing`, `doc`, `hr`, `finance`, `legal`) |
| `source` | string | File origin: `name`, `storage`, or `external` |
| `url` | string | Public download URL or URL of the original external file |
| `mimeType` | string | MIME type from Firebase Storage `contentType` |
| `size` | number | File size in bytes |
| `authorKey` | string | `bkey` of the `PersonModel` who authored the document |
| `authorName` | string | Denormalised author display name |
| `dateOfDocCreation` | string | Date the document was originally created |
| `dateOfDocLastUpdate` | string | Date the document was last modified |
| `locationKey` | string | Optional reference to a location (e.g. where a photo was taken) |
| `hash` | string | SHA-256 hash of the file for integrity checking |
| `priorVersionKey` | string | `bkey` of the previous version of this document (version chain) |
| `version` | string | Arbitrary version string (e.g. `1.0`, `2024-03-01`) |

## Firebase Storage Layout
Files are stored at: `tenant/<tenantId>/document/<filename>`

Section uploads use: `tenant/<tenantId>/section/<sectionId>/image/<filename>` or `.../file/<filename>`

## State (DocumentStore)
The `DocumentStore` (NgRx Signal Store) holds:
- `documentKey` — key of the single document being viewed/edited
- `listId` — active filter scope (`all`, `p:`, `t:`, or `f:` prefix)
- `searchTerm`, `selectedTag`, `selectedType`, `selectedSource` — additional filters
- `documentsResource` — full tenant document list ordered by `fullPath`
- `documentResource` — single document stream keyed by `documentKey`
- `subfoldersResource` — child folders when `listId` starts with `f:`

Notable store actions:
- `add(priorVersionKey?)` — picks a file, uploads to Storage, creates `DocumentModel`, navigates to the detail page; sets `version = '1.0'` for new files
- `addFiles()` — batch upload: picks multiple files, uploads each, creates a `DocumentModel` per file, assigned to the current folder
- `addFolder()` — prompts for a name, creates a nested `FolderModel`, then navigates into it
- `update(document)` — starts a new version chain entry by calling `add(document.bkey)`
- `getRevisions(document)` — follows `priorVersionKey` backwards to build the full version history
- `edit(document)` — navigates to `/document/<bkey>` detail page
- `delete(document)` — confirmation-guarded deletion
- `preview(document)` — opens `document.url` in the Capacitor browser
- `download(document)` — opens `document.url` in a new browser tab

## Key Components
| Component | Selector / Role |
|---|---|
| `DocumentListComponent` | List view with `listId`-scoped filtering, subfolder navigation, multi-file upload |
| `DocumentEditPage` | Detail/edit page for a single document's metadata |
| `DocumentAccordionComponent` | Collapsible accordion embedding a document list (used inside other features) |
| `ImageSelectModalComponent` | Modal for selecting an existing document/image to reference |

## Data Access
`DocumentService` (`@bk2/document-data-access`) and `FolderService` (`@bk2/folder-data-access`) are the Firestore gateways. `UploadService` (`@bk2/avatar-data-access`) handles Firebase Storage uploads.

## Version Chain
Documents form an optional linked list: `priorVersionKey` points to the previous version's `bkey`. `getRevisions()` traverses this chain and returns all versions ordered from newest to oldest. The `version` field holds a human-readable version identifier.
