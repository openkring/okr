# Diary Domain (places and people repair page)

## Overview

The diary was imported once from Google Drive. Since 2026-10-24 the app is the master of the diary
(spec 1.117): the import and its two Cloud Functions (`dryRunDiaryImport` / `commitDiaryImport`)
are retired, because a further run would overwrite entries edited in the app. This lib holds the
single screen that repairs what the import could not match: `/diary/import`, `isAdminGuard`,
reached from the Tagebuch context menu.

It shows every location and person the diaries mention, resolved and unresolved side by side,
with the repairs on each unresolved one.

## Why the lists come from `diaries`

The lists are aggregated from the stored `DiaryModel` documents, so every row is actionable: the
repair is written onto the entries the reference appears in.

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
| `diary-import.ts` | the screen: a card per reference kind |
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
