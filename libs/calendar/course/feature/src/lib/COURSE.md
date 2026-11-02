# Course Domain (Trainings-Kurse)

## Overview

A course (`CourseModel`) bundles the events of a group's training series (`CalEventModel.courseKey`), keeps the
attendance, produces the report (generic CSV or J+S) and the trainers' compensation. This lib holds the smart parts:
the list, its store and the edit modal. The spec is `planning/specs/2026-11-01-training-course-spec.md`.

## Entry and routes

| Route | Component | Guard |
|---|---|---|
| `/course/:groupKey/:listId/:contextMenuName` | `CourseList` | `isAuthenticatedGuard` |
| `/course/table/:courseKey` | course table page (added with that page) | `isAuthenticatedGuard` |

Both routes belong to the `calevent` feature block (`libs/tenant/routes/src/lib/feature-catalogue.ts`); the course has
no block of its own. The list is opened from the context menu of a group's calendar: row `calevent-courses` of
`c-calevents` makes `CalEventList` navigate to `/course/<groupKey>/all/c-courses`. The row is hidden for every
calendar that is not a group calendar.

## Who may do what

The rules in `firestore.rules` are the guard; the UI mirrors them in `course-access.util.ts` (util lib).

| Action | Allowed |
|---|---|
| Read a course | everybody in the tenant |
| Create a course | `privileged` or admin of the group |
| Edit, archive | `privileged`, a responsible person of the course, admin of the group |
| Read and write the finance document | the same, plus the treasurer |
| See the yearly totals | treasurer, `privileged`, `admin` (only they can read `bookings`) |

## Store

`CourseStore` (provided by `CourseList`): state `groupKey`, `searchTerm`; computed `courses`, `canAdd`, `canManage`,
`yearlyTotals`; methods `add()`, `edit(course)`, `archive(course)`, `openTable(course)`, `exportGeneric()`.

- The edit modal is imported on demand (`await import()`): it brings the accounting data-access services.
- `edit()` reads the finance document only for people who may read it (`mayReadCourseFinance`), passes it to the modal,
  and calls `saveFinance` only when the modal returns `finance` (the finance form was shown and changed). The course
  is written only if it differs from the one passed in.
- The yearly totals (`yearlyTotals`) are summed from the posted compensation bookings (okey prefix `course-`) of the
  tenant's default books (`appConfig.defaultAccountingTenantId`, never the app tenant). Without default books, or for
  anybody but the treasurer / privileged / admin, nothing is queried and the card stays hidden. The booking date
  decides the year.

## Menus

Menu documents are catalogue-owned (`FEATURE_BLOCKS`, block `calevent`): the row `calevent-courses` (child of
`c-calevents`) and the context menu `c-courses` with `course-add` (`add`) and `course-export-generic`
(`exportGeneric`). Labels are `@item.*` keys in `libs/cms/menu/feature/src/i18n`.

## Firestore indexes

- `courses`: `tenants, isArchived, groupKey, startDate desc` (the list).
- `bookings`: `tenants, accountingTenantId, isArchived, status, __name__` (the yearly totals read the `course-` okey
  prefix of posted bookings).
