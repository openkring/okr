# Reservation Domain

## Overview

The `Reservation` entity models the reservation of a resource (e.g. a rowing boat, a room) by a person or organisation. It supports bookings, reservations, and event registrations, with optional pricing. When the first reservation for a resource is created, a resource calendar is opened automatically; all subsequent reservations are kept in sync with their associated calendar events.

## Firestore Collection

Collection name: `reservations`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `tags` | string | Comma-separated tags |
| `name` | string | Display name of the reservation |
| `notes` | string | Internal notes |
| `reserver` | AvatarInfo? | Avatar of the person or org making the reservation |
| `resource` | AvatarInfo? | Avatar of the resource being reserved |
| `startDate` | StoreDate | Start date of the reservation |
| `startTime` | string | Start time (HH:MM) |
| `fullDay` | boolean | Whether the reservation spans a full day |
| `durationMinutes` | number | Duration in minutes (e.g. 60, 120, 1440 for full day) |
| `endDate` | StoreDate | End date of the reservation |
| `participants` | string | Description of participants |
| `area` | string | Area or location within the resource |
| `ref` | string | Reference number or contact person |
| `state` | string | State key: e.g. `reserved`, `confirmed`, `cancelled`, `noShow` |
| `reason` | string | Reason/category key (e.g. `course`, `meeting`, `party`, `maintenance`) |
| `order` | number | Waiting-list order (relevant when state is `applied`) |
| `description` | string | Public notes visible to invitees/participants |
| `price` | MoneyModel? | Optional price for the reservation |

## Reservation State

| State | Description |
| --- | --- |
| `reserved` | Reservation created, not yet confirmed |
| `confirmed` | Reservation confirmed by the resource manager |
| `cancelled` | Reservation cancelled |
| `noShow` | Reserver did not appear |
| `applied` | Waiting list application |

## Reservation Reasons

Configured in the `reservation_reason` category list. Typical values: `course`, `workshop`, `meeting`, `party`, `socialEvent`, `maintenance`, `sportsEvent`, `businessEvent`, `privateEvent`, `publicEvent`, `storagePlace`, `clubEvent`.

## `ReservationApplyModel`

A simplified form model (not persisted directly) used by the public-facing `ReservationApplyModal`. It collects the minimum required information for an application/booking request. Fields mirror `ReservationModel` but omit administrative fields. Additional fields: `usesTent` (boolean), `company` (string), `isConfirmed` (boolean — when true, the confirmation toolbar is shown).

On submit, `convertApplyToReservation()` converts the apply model into a full `ReservationModel`.

## Store: `ReservationStore`

An NgRx Signal Store managing all reservation state.

**Key state fields:**

| Field | Description |
| --- | --- |
| `listId` | Filter format: `t_<resourceType>`, `r_<resourceKey>`, `p_<personKey>`, `o_<orgKey>`, or `all` |
| `showOnlyCurrent` | When true, shows only currently active reservations (via `isValidAt`) |
| `reserverId` | Key of the person or org whose reservations are shown |
| `reserverModelType` | `'person'` or `'org'` |
| `resourceId` | Key of the resource whose reservations are shown |
| `searchTerm` / `selectedTag` / `selectedReason` / `selectedState` | Filter state |
| `selectedYear` | Year filter applied to `startDate` |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allReservations` | All reservations loaded |
| `currentReservations` | Reservations currently active (via `isValidAt` on startDate/endDate) |
| `reservations` | Filtered by `showOnlyCurrent` |
| `currentReserver` | Loaded `PersonModel` or `OrgModel` for the current `reserverId` |
| `currentResource` | Loaded `ResourceModel` for the current `resourceId` |
| `calevent` | Optional `CalEventModel` loaded for `caleventId` |
| `filteredReservations` | Applies listId prefix filter plus all UI filters |

**List ID Prefixes:**

| Prefix | Filters by |
| --- | --- |
| `t_` | `resource.type` |
| `r_` | `resource.key` |
| `p_` | `reserver.key` (person) |
| `o_` | `reserver.key` (org) |
| `my` | Resolves to `p_<currentUser.personKey>` |

**Key methods:**

| Method | Description |
| --- | --- |
| `setListId(listId)` | Sets list filter, resolves `my`, and triggers related resource loads |
| `setReserverId(reserverId, reserverModelType)` | Scopes to a specific reserver |
| `setResourceId(resourceId)` | Scopes to a specific resource |
| `add(readOnly)` | Creates a new `ReservationModel` pre-filled with current reserver/resource and opens the edit modal |
| `edit(reservation, readOnly, isSelectable)` | Opens `ReservationEditModalComponent` |
| `end(reservation?, readOnly)` | Picks an end date and sets `endDate` |
| `delete(reservation?, readOnly)` | Confirms and hard-deletes a reservation |

## Components

### `ReservationEditModalComponent`

An Ionic modal for creating or editing a `ReservationModel`. Receives `reservation`, `currentUser`, `tags`, `reasons`, `states`, `periodicities`, `locale`, `isSelectable`, `readOnly`.

### `ReservationApplyModal` (`bk-reservation-apply-modal`)

A public-facing modal that allows a user to submit a booking/application for the default resource. Uses `ReservationApplyForm` from `@bk2/relationship-reservation-ui`. A confirmation toolbar is shown once the form is valid and `isConfirmed` is set. On confirm, converts `ReservationApplyModel` to `ReservationModel` via `convertApplyToReservation()`.

### `ReservationListComponent`

A standalone list view of reservations with search, year, reason, state, and tag filters.
