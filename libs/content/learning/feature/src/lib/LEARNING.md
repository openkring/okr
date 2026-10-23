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
callables check again; the client only hides actions. The client actor comes from `learningActorOf`,
which — like the server's `learningActor` — grants nothing unless `roles.registered === true`.

Uploads run prepare → signed PUT → `completeLearningUpload` (`LearningService.upload`,
`runLearningUpload`). The completion checks the object exists with the declared size and, for the
default bucket, sets the Firebase download token with the Admin SDK and writes `docs.url`. A failed
PUT or a refused completion removes the half-created document again.

## Publishing

Rooms page → «Veröffentlichen»: the warning alert (`learningPublishAlertOptions`) acts only on role
`confirm`, flips `page.isPrivate` and logs `learning/publish` (or `learning/unpublish`) with the page key
in the activity log (admin-visible). The log is written after the flip; when it fails, a warning toast
says the change is saved but not logged (the room state is not rolled back).

A room whose folder has `membersMayUpload === true` cannot be published: the store refuses with an
alert, and the public page API returns the locked shell for it anyway. The rules let only
contentAdmin/admin change `isPrivate` on a `learning` page or write a `learning` section, and only they can create, delete or retype a `learning` page.

The public API serves a room only from its own learning page (`type === 'learning'` and section key =
page key); the same section listed on any other page yields the locked shell.

## Archiving

«Archivieren» archives the page and its learning section through `FirestoreService.deleteModel`
(detach or archive, deleting-models skill). The folder and its documents are never touched, and the
folder keeps `learningRoom: true`: it may still hold room files, which must stay out of reach of the
author and folder-owner write paths.

## Privacy

Gate walked 2026-10-23, recorded in spec §7.2.

- Ratings are author-only in the rules; everyone else sees only the aggregate on the document
  (trigger `onRatingWritten`). `SUBJECT_DATA_MAP` row `ratings`: exported, deleted on erasure.
- Curator notes, links and attachments are authored content, not person data. Comments use the
  existing comment lib and rules.
- Publishing is whole-room, contentAdmin/admin only, warned and logged. The public output never
  carries comments, ratings or uploader names; videos are signed only for the room folder.
- Group rooms are tenant-visible at data level (the `docs` rule is `tenantRead`); membership gates
  the UI only. Known and unchanged.
- The rating aggregate (`ratingCount`/`ratingSum`) cannot be changed by a client (rules; admin
  excepted). Room files are protected by the folder flag `learningRoom` (set by `createRoom`): in a
  flagged folder the rules refuse the author's and the folder owner's update and delete and member
  uploads; only contentAdmin/privileged (update) and admin (delete) write directly, the curator
  callables use the Admin SDK. Only contentAdmin/admin may set or change the flag.
  A flagged folder is deletable only by contentAdmin/admin, and `deleteGroupContent` refuses room files
  for group admins. No backfill is needed: rooms are not deployed yet and each new room is flagged at creation.
  `createRoom` sets the flag LAST (after section and page succeeded); if that write fails, page and section
  are rolled back and the failure toast shows, so a half-created room never locks a folder.
  `updateGroupFolder` refuses a group admin on a flagged folder (no rename, no `membersMayUpload` toggle).
  Members may upload into exactly one folder (`folderKeys.size() == 1` in the rules), and `roomDocs` reads
  only the first folder key, as the rules and the public API do.

## Known limits

- Images open the full-size gallery directly; the item page is reached from files and videos.
- Search covers comment text only after the comments are loaded once per room, on the first query.
- An empty list is not proof of an empty room: `searchData` turns listener errors into `[]`.
