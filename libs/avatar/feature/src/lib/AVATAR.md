# Avatar Domain

## Overview

The Avatar domain manages profile images (avatars) for models — primarily persons, orgs, and groups. It handles:

- Uploading photos from the device camera via Capacitor.
- Storing and retrieving avatar images in Firebase Storage under the path `avatar/<modelType>.<key>`.
- Displaying a circular avatar image in a toolbar with an optional title and subtitle.
- Zooming an avatar image in a modal when tapped in read-only mode.
- Falling back to a default SVG icon (from imgix CDN) when no photo has been uploaded.

## Firestore Collection

Collection name: `avatars`

The `AvatarModel` is a lightweight metadata record that points to the Firebase Storage path.

## Field Semantics

| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID — conventionally `<modelType>.<modelKey>`, e.g. `person.abc123` |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `storagePath` | string | Relative path to the image in Firebase Storage |
| `isArchived` | boolean | Soft-delete flag |

## Key Components

### AvatarToolbarComponent (`bk-avatar-toolbar`)

Presentational toolbar that shows a circular avatar image, an optional title, and an optional subtitle. Inputs:

| Input | Type | Description |
|---|---|---|
| `key` | string (required) | Composite key `<modelType>.<modelKey>`, e.g. `person.abc123` |
| `modelType` | `'person' \| 'org' \| 'group'` (required) | Determines the default fallback icon |
| `readOnly` | boolean | If false, a camera icon overlay is shown and clicking triggers photo upload |
| `alt` | string | Alt text for the image |
| `title` | string? | Displayed below the avatar |
| `subTitle` | string? | Displayed beneath title; `tel:` or `mailto:` prefixes render as clickable links |
| `color` | ColorIonic | Toolbar color |

Output: `imageSelected` — emits the selected `Photo` object (Capacitor) after upload.

### AvatarToolbarStore

NgRx Signal Store (provided at component level). Key behaviours:

- `setKey(key)` / `setModelType(modelType)` — Update state from component inputs via an `effect()`.
- `urlResource` — `rxResource` that calls `AvatarService.getRelStorageUrl(key)` reactively; falls back to `getDefaultIcon(modelType)` when the storage URL is empty.
- `url` (computed) — calls `AvatarService.getAvatarUrl(key, defaultIcon)` to build the full imgix URL.
- `showZoomedImage()` — Reads image dimensions from Firebase Storage metadata (or calculates and uploads them) then opens a zoom modal.
- `uploadPhoto()` — Delegates to `UploadService.takePhoto()` (Capacitor Camera).

## Related Libraries

| Library | Purpose |
|---|---|
| `@bk2/avatar-data-access` | `AvatarService` (storage URL resolution), `UploadService` (camera/upload) |
| `@bk2/avatar-ui` | `AvatarDisplayComponent`, `AvatarSelectComponent` — presentational avatar widgets |
| `@bk2/avatar-util` | `getDefaultIcon(modelType)` — maps model types to fallback SVG icon names |

## Library Path

`@bk2/avatar-feature` (`libs/avatar/feature/src/lib/`)
