# Learning rooms (Lernräume)

Spec: `planning/specs/2026-10-22-learning-media-sharing-spec.md` (TOC 1.115, part 2, §5–§8).

A learning room is a CMS page of type `learning`. Its settings (root folder, topics, curators per
topic, start tab) live on the page's first `learning` section. Material belongs to a room by sitting
in the room's folder; topics are tags. Members read, play, download, rate and comment; curators of a
topic upload into it and edit its material; contentAdmin/admin do everything and manage the rooms.

## Libraries

| Lib | Holds |
| --- | --- |
| `@okr/content-learning-util` | rights, classification, filter, ratings, room keys and `groupFilesSegment`, Vest suites, i18n keys and the five language files |
| `@okr/content-learning-data-access` | `LearningService` (room docs, comment texts, callables, signed upload, public room) and `RatingService` |
| `@okr/content-learning-ui` | toolbar, video grid, image grid, file list, rating stars, item and room forms and modals, publish alerts |
| `@okr/content-learning-feature` | `LearningStore`, `LearningRoomPage`, `LearningItemPage`, `LearningRoomsPage` |

Cloud Functions: `apps/functions/src/learning/` (saveLearningItem, prepareLearningUpload,
deleteLearningItem, rating trigger) and the `learning` case of `apps/functions/src/publicApi/routes/page.ts`.

## Rooms and keys

| Room | Page key | Section key | Folder |
| --- | --- | --- | --- |
| menu room | `<tenantId>_learning_<slug>` (slug from the name, unique) | = page key | chosen, or a new folder named after the room |
| group room | `<groupKey>_learning` | = page key | the group folder (`<groupKey>`, `ensureGroupFolder`) |

A new room is private (`page.isPrivate = true`). The rooms page shows the URL `/private/<pageKey>`
to copy into a menu entry; menu entries are made in the menu editor (no client-side `menuItems` writes).

## Routes

| Route | Component | Guard |
| --- | --- | --- |
| `/private/<pageKey>` and `/public/<pageKey>` | `PageDispatcher` → `LearningRoomPage` | cms routes |
| `/private/learning-item/:pageKey/:docKey` | `LearningItemPage` | signed in |
| `/private/learning-rooms` | `LearningRoomsPage` («Lernräume») | contentAdmin |

The block `learning` is listed before `cms` in `FEATURE_ROUTES`, because `cms` owns the catch-alls
`private/:id` and `private/:id/:contextMenuName`.

## How the pieces connect

- `PageDispatcher` (`@case ('learning')`) creates `LearningRoomPage` with a dynamic `import()` — never a
  static import (lazy-loading skill, Pattern A) — and passes the resolved page key. The room page
  cannot read `PageStore` (that lib imports this one), so `LearningStore` reads the page and its
  sections itself.
- The group view's «Dateien» segment asks `groupFilesSegment(page, groupKey, tenantId)` (util): a live
  `<groupKey>_learning` page of type `learning` renders `<okr-page-dispatcher id="<groupKey>_learning">`,
  otherwise today's document list.
- Signed out on `/public/<pageKey>`: the room renders from `LearningService.publicRoom` (the public page
  API returns material only for published rooms). No comments, ratings or uploader names.

## Rights

Decided by `curatedTopics`/`canEditItem`/`canChangeTags`/`canDeleteItem`/`canUploadTo` with
`isGroupAdmin: false`: group admins are NOT curators (any member can write `group.admins`). The
callables check again; the client only hides actions.

## Publishing

Rooms page → «Veröffentlichen»: the warning alert (`learningPublishAlertOptions`) acts only on role
`confirm`, flips `page.isPrivate` and logs `learning/publish` (or `learning/unpublish`) with the page key
in the activity log (admin-visible).

## Archiving

«Archivieren» archives the page and its learning section through `FirestoreService.deleteModel`
(detach or archive, deleting-models skill). The folder and its documents are never touched.

## Known limits

- Images open the full-size gallery directly; the item page is reached from files and videos.
- Search covers comment text only after the comments are loaded once per room, on the first query.
- An empty list is not proof of an empty room: `searchData` turns listener errors into `[]`.
