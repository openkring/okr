# Diary Domain (AOC screen)

## Overview

The diary is the repo owner's private archive, imported from Google Drive by two Cloud Functions
(`dryRunDiaryImport` / `commitDiaryImport`, spec 1.34). This lib holds the single screen that
prepares and repairs that import: `/aoc/diary`, `isAdminGuard`, contributed by the `aoc`
catalogue block (the same owner-vs-target split as `aoc/trip` — aoc owns the entry point, another
lib ships the screen).

Two halves:

1. **Import prerequisites** — the Drive health check and the import dry run. Both used to sit on
   `/security/privacy-audit` because that was the app's only admin-only diagnostics surface while
   the diary domain had no page; their own doc comments said to move them here.
2. **Places and people** — every location and person the archive mentions, resolved and
   unresolved side by side, with the repairs on each unresolved one.

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
| `aoc-diary.ts` | the screen: prerequisites card + a card per reference kind |
| `aoc-diary.store.ts` | component-provided `signalStore`; owns the diaries stream and performs every write |
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

## Library Path

`libs/content/diary/{util,data-access,feature}` → `@okr/content-diary-{util,data-access,feature}`
