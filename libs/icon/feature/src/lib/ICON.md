# Icon Domain

## Overview
The Icon domain manages SVG icons that are stored in Firebase Storage and tracked as metadata records in Firestore. Each `IconModel` document describes a single `.svg` file: its name, type (icon set), storage path, file size, and a searchable keyword index.

Icons are organised into named **icon sets** (subdirectories under `logo/` in Firebase Storage, e.g. `icons`, `general`, `sport`). The list of available sets is derived at runtime from the distinct `type` values found in the Firestore `icons` collection and also from the hardcoded `ICON_SETS` constant which serves as the canonical set list for the `sync` operation.

The `IconSelectModalComponent` (re-exported from this library) is used across the application wherever users need to pick an SVG icon — e.g. in menu items, section headers, and category items.

## Firestore Collection
Collection name: `icons`

## Firebase Storage Layout
Icons are stored at: `logo/<type>/<name>.svg`

Examples:
- `logo/icons/folder.svg`
- `logo/sport/rowing.svg`
- `logo/general/home.svg`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by `tenantId` |
| `isArchived` | boolean | Soft-delete flag |
| `name` | string | Icon filename without extension, e.g. `folder` |
| `type` | string | Icon set name = Storage subdirectory, e.g. `icons`, `sport` |
| `fullPath` | string | Full Firebase Storage path, e.g. `logo/icons/folder.svg` |
| `size` | number | File size in bytes |
| `updated` | string | Last-modified date in store format (`YYYYMMDD`) |
| `index` | string | Editable space-separated keyword list, e.g. `folder open create new`; used for full-text search |
| `tags` | string | Comma-separated tags for chip-based filtering |
| `notes` | string | Optional human-readable description |

## State (IconStore)
The `IconStore` (NgRx Signal Store) holds:
- `searchTerm` — text filter applied to `icon.index` and `icon.name`
- `selectedDir` — active icon-set filter (empty = show all)
- `selectedTag` — tag chip filter
- `iconsResource` — live Firestore stream of all icons for the tenant

Computed signals:
- `icons` — all loaded `IconModel` instances
- `filteredIcons` — icons matching the current `searchTerm`, `selectedDir`, and `selectedTag`
- `iconsCount` — total count before filtering
- `iconSets` — distinct sorted `type` values from loaded icons (drives the set filter chips)
- `tags` — tag chips from `AppStore.getTags('icon')`

Notable store actions:
| Method | Description |
|---|---|
| `add(readOnly)` | Picks an SVG file via `UploadService`, uploads to `logo/{selectedDir}/{name}.svg`, creates an `IconModel` in Firestore |
| `edit(icon, isNew, readOnly)` | Opens `IconEditModalComponent`; updates the record on confirm |
| `delete(icon, readOnly)` | Deletes the Firestore record (does **not** remove the file from Storage) |
| `sync()` | Scans every entry in `ICON_SETS` via `listAll` on Firebase Storage, then creates a Firestore `IconModel` for every `.svg` file that is not yet tracked. Skips files already present (matched by `type/name`). Useful for initial population or after bulk Storage uploads. |
| `export(type)` | Placeholder — not yet implemented |

## Key Components
| Component | Selector | Role |
|---|---|---|
| `IconListComponent` | `bk-icon-list` | Admin list/grid view with search, icon-set filter, view toggle, CRUD action sheet, and context menu |
| `IconEditModalComponent` | `bk-icon-edit-modal` | Edit/view modal for a single icon's metadata |
| `IconSelectModalComponent` | `bk-icon-select-modal` | Selection modal used across the app to pick an SVG icon; returns the icon `name` string on confirm |

## Key Library Layers
| Import alias | Purpose |
|---|---|
| `@bk2/icon-data-access` | `IconService` — Firestore CRUD for the `icons` collection |
| `@bk2/icon-feature` | `IconStore`, `IconListComponent`, `IconEditModalComponent`, `IconSelectModalComponent` |
| `@bk2/icon-ui` | `IconEditFormComponent` — form for editing icon metadata |
| `@bk2/icon-util` | `getIconIndex`, `getIconStoragePath`, `buildIconModel`, `buildIconModelFromStorage`, `iconValidations` |

## Data Access
`IconService` (`@bk2/icon-data-access`) is the Firestore gateway:
- `list()` — real-time stream of all icons for the tenant, ordered by `name`
- `create / update / delete` — write operations; `create` and `update` recompute `index` via `getIconIndex`

`UploadService` (`@bk2/avatar-data-access`) handles Firebase Storage uploads for the `add` operation.

## Icon Select Usage
```typescript
// Open the icon picker from any component or store:
const modal = await modalController.create({
  component: IconSelectModalComponent,
  componentProps: { initialDir: 'icons' }   // optional: pre-select an icon set
});
await modal.present();
const { data, role } = await modal.onDidDismiss();
if (role === 'confirm') {
  const iconName: string = data;  // e.g. 'folder'
}
```

## Sync Operation
`sync()` is the recommended way to initially populate the `icons` Firestore collection from existing Storage files:

1. Loads the current Firestore icons into a `Set` keyed by `type/name` to detect existing records.
2. Iterates `ICON_SETS = ['filetypes', 'general', 'icons', 'ionic', 'models', 'section', 'sport', 'weather']`.
3. Calls `listAll(logo/{iconSet})` on Firebase Storage.
4. For each `.svg` not yet in Firestore: fetches metadata, builds an `IconModel`, and calls `iconService.create`.
5. Reloads the store after all new records have been written.

The operation is idempotent — running it multiple times will not create duplicates.

## Rendering Icons
Icons are rendered with the `SvgIconPipe`:
```html
<ion-icon src="{{ iconName | svgIcon:iconType }}" />
```
The pipe resolves the Firebase Storage download URL from `name` and `type`.
