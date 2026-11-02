# Course Domain (Trainings-Kurse)

## Overview

A course (`CourseModel`) bundles the events of a group's training series (`CalEventModel.courseKey`), keeps the
attendance, produces the report (generic CSV or J+S) and the trainers' compensation. This lib holds the smart parts:
the list, its store and the edit modal, and the course table page with its own store. The spec is `planning/specs/2026-11-01-training-course-spec.md`.

## Entry and routes

| Route | Component | Guard |
|---|---|---|
| `/course/:groupKey/:listId/:contextMenuName` | `CourseList` (`groupKey = all`: every course of the tenant) | `isAuthenticatedGuard` |
| `/course/table/:courseKey` | `CourseTablePage` (attendance, lock, exports, request) | `isAuthenticatedGuard` |

Both routes belong to the `calevent` feature block (`libs/tenant/routes/src/lib/feature-catalogue.ts`); the course has
no block of its own. There are three ways in:

- The «Kurse» chip at the top of a group calendar (`CalEventList`, also inside the group view), shown to everybody who
  sees the calendar once the group has at least one non-archived course. It navigates to
  `/course/<groupKey>/all/c-courses`. `CourseService` is loaded lazily for it (no static import of the course libs).
- The row `calevent-courses` of `c-calevents` (context menu, calendar editors; this is where they reach `add`).
  Hidden for every calendar that is not a group calendar.
- The treasurer's row `courses-all` in `accounting-menu`: `/course/all/all/c-courses`, every course of the tenant
  with the group name on each row, plus the yearly totals.

## Who may do what

The rules in `firestore.rules` are the guard; the UI mirrors them in `course-access.util.ts` (util lib).

| Action | Allowed |
|---|---|
| Read a course | everybody in the tenant |
| Create a course | `privileged` or admin of the group |
| Edit, archive | `privileged`, a responsible person of the course, admin of the group |
| Read and write the finance document | the same, plus the treasurer |
| See the yearly totals | treasurer, `privileged`, `admin` — enforced by the UI only (see below) |

## Store

`CourseStore` (provided by `CourseList`): state `groupKey`, `searchTerm`; computed `courses`, `canAdd`, `canOpenMenu`,
`yearlyTotals`; methods `add()`, `edit(course)`, `archive(course)`, `openTable(course)`, `exportGeneric()`.

- The edit modal is imported on demand (`await import()`): it brings the accounting data-access services.
- `edit()` reads the finance document only for people who may read it (`mayReadCourseFinance`), passes it to the modal,
  and calls `saveFinance` only when the modal returns `finance` (the finance form was shown and changed). The course
  is written only if it differs from the one passed in.
- The finance read is strict (`CourseService.readFinanceStrict`, a server read): `null` means the server confirmed that
  there is no document (the form starts fresh), a rejection means «unknown». In that case the dialog opens WITHOUT the
  finance part, so nothing can be saved over the real document, and a toast says so (`loadFinanceForEdit`).
- The yearly totals (`yearlyTotals`) are summed from the posted compensation bookings (okey prefix `course-`) of the
  tenant's default books (`appConfig.defaultAccountingTenantId`, never the app tenant). Without default books, or for
  anybody but the treasurer / privileged / admin, nothing is queried and the card stays hidden. The booking date
  decides the year.
- Mind: `bookings` and `booking-lines` are readable tenant-wide (`tenantRead()` in `firestore.rules`). The rules do not
  protect the compensation amounts; the UI gate above does, and it is the only guard. Any signed-in member could read
  the bookings with their own query.
- With `groupKey = all` the list reads every course of the tenant (`CourseService.listAll`); the group admin flag is
  then evaluated per course, `add` is not offered, and each row shows its group.

## Course table

`CourseTablePage` (`/course/table/:courseKey`) with its own `CourseTableStore` (not `CourseStore`: the list's
resources, among them the posted bookings of the yearly totals, must not query on this page). The dumb grid
`okr-course-table` and the attendance dialog (`CourseAttendanceModal` + `CourseAttendanceForm`) live in the `ui` lib;
the pure helpers (`attendanceRowsForEvent`, `attendanceEntriesToWrite`, `visibleFindings`, `presentCounts`,
`compensationErrorKey`, `compensationSummary`) in the util lib.

| Who | Sees | Does |
|---|---|---|
| A member of the course's group, or a person on a course event (guest, substitute) | the whole table: sign-up (small), attendance (large), leader star, sums | — (no amounts, no findings, no export; D7) |
| Anybody else of the tenant | the not-found state (§13: the table shows the attendance of minors) | — |
| Trainer, responsible, group admin, `eventAdmin`, privileged | + findings | confirm attendance per event (from its start on), assign / take out events — only while the course is not locked; exports |
| Responsible, group admin, privileged | + compensation columns (when the finance document was read) | lock / unlock, request compensation, «reported», fill in missing J+S numbers |
| Treasurer | + findings, compensation columns | exports |

- **View gate** (`mayViewCourseTable`): the course, its events and the viewer's own group memberships
  (`listMembershipsOfMember(personKey, 'person', 'group')`) are read to decide; the group's members, the unassigned
  events and the finance document only after it.
- **Attendance.** Tapping a column opens an ActionSheet (record attendance, take out of the course). The dialog
  starts from the stored entries, else from the prefill; a not yet confirmed event opens dirty, so saving the unchanged
  prefill IS the confirmation. Saving merges against the LIVE event: persons without a stored entry and rows the user
  changed are written, everything else keeps what is stored (also what another trainer stored while the dialog was
  open). Only the first confirmation writes `attendanceConfirmedBy/At`; corrections carry `by`/`at` per entry. Rows whose person key is empty or not plain (`[A-Za-z0-9_]+`) are dropped, a person is
  written once. One `updateDoc` with field paths (`CourseService.writeAttendance`), so a member signing up at the same
  time (`attendees[]`) never collides.
- **Lock** refuses with the list of past, unconfirmed events (§7.8). **Unlock** warns that a new J+S import overwrites
  the reported attendance and removes `lockedBy` / `lockedAt`. Lock, unlock and «reported» write only those fields
  (`CourseService.updateCourseState`), never the whole loaded course.
- **Names** follow the viewer's `nameDisplay` everywhere on the page; **amounts** show their currency (the rates').
- **Exports.** Generic CSV (`<course name>.csv`, labels from i18n, compensation columns only for finance readers);
  J+S file (`<courseNumber>_awk.csv`) after a dialog with the BASPO hints and the findings (rows with findings are left
  out, the rest exports).
- **Compensation request** calls `requestCourseCompensation` through `CourseService.requestCompensation` (dynamic
  `firebase/functions` import) with the books of the finance document — never the app tenant. Success shows the
  prepared bookings, posted bookings with a different amount, rejected ones and unlisted leaders; a refusal shows a plain
  message per `details.reason` (`compensationErrorKey`).
- **Unassigned group events** (`CourseService.listGroupEventsInPeriod`: tenant + period query, calendar filtered on
  the client because `tenants` already takes the one `array-contains`) are only loaded for those who may assign.
- **Phone width** (< 768px): the grid becomes one list per event.
- **Offline**: every read is a Firestore listener held while the page is open; persons come from the AppStore. The
  request is a callable and needs the network.

## Course events in the group calendar (spec §6)

- A trainer (or responsible person) may create, change and delete the group-calendar events that carry THIS course's
  `courseKey` — never events without or with a foreign one. `CalEventList.canChange` has the course branch before the
  group-admin return (`isCourseTrainerFor`, `@okr/calendar-calevent-util`); the rules decide for real.
- **«Serie hinzufügen»** (toolbar, shown for `canEdit`: never on a locked course) navigates to
  `/calevent/<groupKey>/c-calevents?addCourse=<courseKey>`. `CalEventList` opens the normal edit modal there with
  `courseKey`, the course name, a weekly rhythm and the course period preset (`courseSeriesPatch`). The course table
  does not import the calevent store.
- A **copy** of a course event keeps the `courseKey` only for a course editor and only on an open course; otherwise it
  is a plain group event (the rules would deny the create).
- On a **locked** course, deleting or archiving events (single delete, series delete, a series edit that shortens the
  range) is refused client-side with a message (`CalEventStore.refuseLockedCourseRemoval`) instead of a failing batch.
  Plain edits that do not archive stay allowed, as in the rules.

## Menus

Menu documents are catalogue-owned (`FEATURE_BLOCKS`): in block `calevent` the row `calevent-courses` (child of
`c-calevents`) and the context menu `c-courses` with `course-add` (`add`) and `course-export-generic`
(`exportGeneric`); in block `finance` the treasurer's row `courses-all` (child of `accounting-menu`). Labels are `@item.*` keys in `libs/cms/menu/feature/src/i18n`.

## Firestore indexes

- `courses`: `tenants, isArchived, groupKey, startDate desc` (the list of one group, also the «Kurse» chip) and
  `tenants, isArchived, startDate desc` (the overview of all groups).
- `bookings`: `tenants, accountingTenantId, isArchived, status, __name__` (the yearly totals read the `course-` okey
  prefix of posted bookings).
