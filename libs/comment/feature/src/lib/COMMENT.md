# Comment Domain

## Overview
The Comment domain provides a simple threaded annotation capability that can be attached to any model. A `CommentModel` references its parent via `parentKey` (a composite key of the form `<modelType>.<bkey>`). Comments are shown in two UI patterns: an accordion that collapses/expands the list, and an embedded card view.

Comments are intentionally lightweight: no edit/delete is exposed to end users — only adding new comments via a prompt dialog. Administrative deletion is possible through the store.

## Firestore Collection
Collection name: `comments`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Search index string |
| `authorKey` | string | `bkey` of the `UserModel` who wrote the comment |
| `authorName` | string | Display name of the author (denormalised for read performance) |
| `creationDateTime` | string | ISO-8601 timestamp of when the comment was created |
| `parentKey` | string | Composite reference to the parent model (e.g. `person.abc123`) |
| `description` | string | The comment text content |
| `tags` | string | Comma-separated tags |

## State (CommentListStore)
The `CommentListStore` (NgRx Signal Store, local scope — provided in `CommentsAccordionComponent`) holds:
- `parentKey` — drives the Firestore query; updated via `setParentKey()`
- `commentsResource` — live Firestore stream filtered by `parentKey`

The store exposes a single action:
- `add(comment?)` — if no text is supplied, prompts the user with an `AlertController` dialog; then calls `CommentService.create()` and reloads the resource

## Key Components
| Component | Selector | Role |
|---|---|---|
| `CommentsAccordionComponent` | `bk-comments-accordion` | Collapsible accordion wrapping the comment list; shows add button for non-read-only users |
| `CommentsCardComponent` | `bk-comments-card` | Inline card embedding the comment list |
| `CommentsListComponent` | (from `@bk2/comment-ui`) | Presentational list rendering individual comments |

### CommentsAccordionComponent Inputs
| Input | Type | Default | Description |
|---|---|---|---|
| `parentKey` | string | (required) | Composite key of the parent model |
| `readOnly` | boolean | `true` | If `false`, shows the add button |
| `name` | string | `comment` | Form control name |
| `color` | string | `light` | Ionic color for the accordion header |

## Data Access
`CommentService` (`@bk2/comment-data-access`) is the Firestore gateway:
- `list(parentKey)` — real-time stream of comments for a given parent
- `create(parentKey, text, currentUser)` — creates a new comment, setting author info and timestamp
