# Whiteboard (`instruments/whiteboard`)

A **free-canvas** board — a stripped-down Miro: a wall of draggable **stickers** and free-text
**labels** at arbitrary x/y over an optional **template** background. It is the **blank-canvas
baseline** for the designabetterbusiness.tools canvases (a `templateKey` turns it into a Persona /
Journey / … canvas without new code).

This is a **separate primitive** from the grid instruments (`InstrumentModel` — SWOT / PESTEL / BMC /
Eisenhower). Grids are list-per-cell with fractional ranks; the whiteboard is free x/y. They share
the model-factory / i18n conventions, **never the renderer** (spec D1).

## Firestore collection

`whiteboards` — one `WhiteboardModel` document per board, with **embedded** `items[]` (a board is
small and always loaded whole, mirroring `InstrumentModel.topics`). No subcollection, no presence /
live cursors in v1 (last-write-wins per item on `pointerup`).

## Field semantics (`WhiteboardModel`, `@okr/shared-models`)

| Field | Meaning |
|-------|---------|
| `templateKey` | references a **code-constant** `WhiteboardTemplate` (`@okr/instruments-whiteboard-util`); `''` = blank canvas. The shape is code; the placed items are data. |
| `items[]` | embedded `WhiteboardItem`s. `kind` = `sticker` \| `label`; `x/y/w/h` in **unscaled canvas coordinates** (pan/zoom lives on the viewport wrapper, not the item); `color` (sticker tint / label text colour, `''` = theme default); `ownerKey` (optional `Person`). |
| `author` | `AvatarInfo` of the creator/owner. |
| `visibility` | extends visibility beyond author + privileged. |

Which template **zone** an item sits in is **not stored** — it is derived from position via
`zoneAtPoint` (`@okr/instruments-whiteboard-util`); "drag from zone A to B = reclassification" is a
hit-test side effect, not persisted state.

## Store — `WhiteboardStore`

Component-provided signal store. Lists boards (tenant-scoped `searchData`), streams the open board
live, and turns canvas intents into single-document writes:

- **move** → `moveItem(key, x, y)` — one position write on `pointerup` (D4: no form state to lose).
- **add** → `addItem(kind, x, y)` — appends a new item.
- **tap** → `editItem(item)` — opens the per-item modal, which edits a **clone**; the live stream
  keeps the board fresh underneath and the merge writes to the **latest** board on save/delete.
- board CRUD (`add` / `editMeta` / `delete`) via the metadata modal.

## Components

| Component | Lib | Role |
|-----------|-----|------|
| `WhiteboardList` | feature | board list + ActionSheet (open / edit / delete). |
| `WhiteboardEditorPage` | feature | full-page canvas host; reads `:whiteboardKey`, wires canvas → store. |
| `WhiteboardEditModal` | feature | create/rename metadata (name, description, template, tags). |
| `WhiteboardItemEditModal` | feature | per-item editor (text/colour) + delete. |
| `WhiteboardCanvas` | ui | dumb pan/zoom renderer — hand-rolled DOM + CSS transform, native pointer drag; emits intents. |
| `WhiteboardForm` / `WhiteboardItemForm` | ui | pure Signal-Forms field sets. |

## Routes

- `/whiteboard/:listId/:contextMenuName` → `WhiteboardList` (`isPrivilegedGuard`).
- `/whiteboard/:whiteboardKey` → `WhiteboardEditorPage`.

## Library paths

`@okr/instruments-whiteboard-{util,ui,data-access,feature}` under `libs/instruments/whiteboard/`.

## Scope (v1) & deferred

**In:** stickers + free-text labels, pan/zoom, template background/zones, PNG-free CRUD, embedded
persistence. **Deferred:** arrows/connectors, freehand, images (would push toward a canvas library —
Konva); live presence/cursors (Realtime DB); PNG/PDF export; version snapshots; mobile zone-list
fallback. See `planning/ideas/2026-07-20-whiteboard-spec.md`.
