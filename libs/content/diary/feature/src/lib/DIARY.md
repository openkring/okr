# Diary Domain (import preparation page)

## Overview

The diary is the repo owner's private archive, imported from Google Drive by two Cloud Functions
(`dryRunDiaryImport` / `commitDiaryImport`, spec 1.34). This lib holds the single screen that
prepares and repairs that import: `/diary/import`, `isAdminGuard`, reached from the Tagebuch context menu
(«Import vorbereiten»).

Two halves:

1. **Import prerequisites** — the Drive health check and the import dry run. Both used to sit on
   `/security/privacy-audit` because that was the app's only admin-only diagnostics surface while
   the diary domain had no page; their own doc comments said to move them here.
2. **Places and people** — every location and person the archive mentions, resolved and
   unresolved side by side, with the repairs on each unresolved one.

## Import from a date (`fromDate`)

Both callables take an optional `fromDate` (StoreDate) when a run starts: only archive files whose
name is dated on or after it are downloaded and parsed. The screen pre-fills it with the day after
the newest imported final entry (`suggestImportFromDate`), so a routine catch-up reads a few dozen
files. Empty = the whole archive, which has outgrown the dry run's time limit (>7'400 files).
The floor is stored on the `diaryImports` run, and continuations inherit it from there — never
from the payload — so a resumed run cannot widen to the whole archive.

Every write is still a full `set` of the day's document: an entry edited in the app is overwritten
when its day is inside the range. Keep the floor after the last day you edited in the app.

## Why the lists come from `diaries`, not from the dry run's report

`DiaryImportModel.unresolvedLocations` / `unresolvedPeople` are slug→count maps. They can say
*how often* something failed to match, but not *which entries* it appears in and not what to write
the fix onto. The lists here are aggregated from the imported `DiaryModel` documents instead —
which means they need at least one `commitDiaryImport` run to show anything, and in exchange every
row is actionable.

## Field semantics this screen depends on

| Field | Meaning |
|---|---|
| `DiaryModel.location` | the matched `LocationModel`, as an `AvatarInfo` |
| `DiaryModel.customLocationLabel` | the raw text when no location matched — the unresolved half of the SAME value, so a fix clears it |
| `DiaryModel.people` | the matched `PersonModel`s, as `AvatarInfo[]` |
| `DiaryModel.customPeopleLabels` | the slugs that matched no person |
| `DiaryModel.places` | a separate slug vocabulary with **no** resolved counterpart — deliberately not shown here, since a mapping would have nowhere to write |
| `DiaryModel.date` | `yyyyMMdd`, but NOT always a calendar date (`DiaryScope`) — rendered via `formatDiaryDate`, never date arithmetic |

Unresolved locations aggregate by `normaliseLocationLabel`, the same key the import's resolver
uses, so 'Zürich ZH' and 'Zuerich' are one row rather than two half-used ones.

## Components

| File | Role |
|---|---|
| `diary-import.ts` | the screen: prerequisites card + a card per reference kind |
| `diary-import.store.ts` | component-provided `signalStore`; owns the diaries stream and performs every write |
| `diary-reference-list.modal.ts` | the places/people list — search + all/open/matched filter, `checkmark` vs `help` per row |
| `diary-usage-list.modal.ts` | the diaries one reference appears in, with 'create' / 'link' per entry |

Both modals only pick; the store acts and re-opens them, so an admin can work through the open
rows without restarting. That is also why neither modal injects the store (see the store↔modal
DI contract in the `new-feature` skill).

## Firestore

`diaries` — read and written by the AUTHOR only (`authorKey == request.auth.uid`), admin
included. `DiaryService.list` therefore filters on `authorKey` alone server-side and applies
`isArchived`/tenant in memory: a second `where` clause would demand a composite index for a
collection that only ever holds one person's own entries.

## Alben

Albums (spec 1.114) give a quick way into the diary by person, location, event, trip, tag and date.

| Piece | Role |
|---|---|
| `diary-albums.modal.ts` | the «Alben» modal: segments Personen, Orte, Ereignisse, Reisen, Tags, Datum; picking one applies a filter to the list |
| `diary-album-edit.modal.ts` / `diary-album.form.ts` | create or edit a person, location or event album (title, notes, resolved `ref` or event slug) |
| `diary-trip.page.ts` | the trip page: days of the trip, route map (`okr-leaflet-map`) and notes |
| `diaryAlbums` | personal per-author collection, document id `tenant__author__kind__ref`; tags and trips have no album document |

**Filter.** The list holds one filter. An album or a trip is a `array-contains` query on
`DiaryModel.albumKeys` (or `tripKey`); the Datum segment is a range. Combining an album with a date
merges both into the single active filter (`{...current, from, to}`). The date filter is not carried in
the URL and is lost on reload.

**`albumKeys`.** Derived keys (`person.p1`, `location.l1`, `event.anrudern`, `tag.Familie`) computed
by `diaryAlbumKeys` in the util lib from people, location, events and tags. Never edited by hand; every
write recomputes them. Trip queries use the index `authorKey`, `tenants`, `tripKey` and sort in memory.

**Scripts** (dry run is the default, `--write` must be explicit, `--tenant` is validated):

- `scripts/backfill-diary-album-keys.mjs` fills `albumKeys` on existing entries.
- `scripts/seed-diary-event-albums.mjs` seeds event albums from the Drive notes; orphan slugs only
  with `--with-orphans`.

## Library Path

`libs/content/diary/{util,data-access,feature}` → `@okr/content-diary-{util,data-access,feature}`
