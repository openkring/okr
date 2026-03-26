# Invitation Domain

## Overview

The `Invitation` entity models the invitation of a person to a calendar event. It records who was invited (invitee), who sent the invitation (inviter), which event the invitation is for, and the current response state of the invitee.

## Firestore Collection

Collection name: `invitations`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index, built from inviteeKey, caleventKey, inviteeLastName, and date |
| `tags` | string | Comma-separated tags for filtering |
| `notes` | string | Internal notes |
| `inviteeKey` | string | Document key of the invited person |
| `inviteeFirstName` | string | First name of the invitee (denormalized for display) |
| `inviteeLastName` | string | Last name of the invitee (denormalized for display) |
| `inviterKey` | string | Document key of the person who sent the invitation |
| `inviterFirstName` | string | First name of the inviter (denormalized) |
| `inviterLastName` | string | Last name of the inviter (denormalized) |
| `caleventKey` | string | Key of the calendar event this invitation belongs to |
| `name` | string | Name of the calendar event (denormalized) |
| `date` | string | Start date of the calendar event (StoreDate format, denormalized) |
| `state` | InvitationState | Response state: `pending`, `accepted`, `declined`, or `maybe` |
| `role` | InvitationRole | Participation role: `required`, `optional`, or `info` |
| `sentAt` | StoreDate | Date the invitation was sent |
| `respondedAt` | StoreDate | Date the invitee responded |

## Invitation State

| State | Description |
| --- | --- |
| `pending` | Invitation sent, awaiting response (default) |
| `accepted` | Invitee confirmed attendance |
| `declined` | Invitee declined |
| `maybe` | Invitee responded tentatively |

## Invitation Role

| Role | Description |
| --- | --- |
| `required` | Attendance is required |
| `optional` | Attendance is optional |
| `info` | Informational only (default) |

## Store: `InvitationStore`

An NgRx Signal Store that manages all invitation state.

**Key state fields:**

| Field | Description |
| --- | --- |
| `caleventKey` | When set, filters invitations to a specific calendar event (used in accordion) |
| `inviteeKey` | When set, computes `myInvitations` for the given person |
| `showOnlyCurrent` | When true, filters to invitations whose event date is still in the future |
| `searchTerm` | Free-text filter on the index field |
| `selectedTag` | Tag chip filter |
| `selectedState` | Filter by invitation state |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allInvitations` | All invitations, optionally filtered to future events |
| `filteredInvitations` | `allInvitations` filtered by searchTerm, selectedState, selectedTag |
| `invitees` | Invitations belonging to the currently set `caleventKey` |
| `myInvitations` | Invitations where `inviteeKey` matches the currently set inviteeKey |

**Key methods:**

| Method | Description |
| --- | --- |
| `invitePerson(calevent)` | Opens a person-select dialog and creates a new invitation |
| `edit(invitation?, readOnly)` | Opens `InvitationEditModalComponent` to view or edit an invitation |
| `delete(invitation, readOnly)` | Confirms and deletes an invitation |
| `changeState(invitation, newState)` | Updates the response state and sets `respondedAt` to today |
| `setScope(caleventKey, inviteeKey, showOnlyCurrent)` | Sets the accordion scope (used by `InviteesAccordionComponent`) |

## Components

### `InviteesAccordionComponent` (`bk-invitees-accordion`)

An Ionic accordion that shows all invitees of a given `CalEventModel`. Each row displays the invitee's avatar, full name, current state, and responded-at date.

Inputs:

| Input | Type | Description |
| --- | --- | --- |
| `calevent` | CalEventModel | The event whose invitees are shown (required) |
| `color` | string | Accordion header color (default: `light`) |
| `title` | string | Accordion header label (default: `@invitation.plural`) |
| `showOnlyCurrent` | boolean | Filter to future events only (default: true) |
| `readOnly` | boolean | When false, shows add/edit/delete actions (default: true) |

Tapping an invitee row opens an ActionSheet. Invitees can change the state of their own invitation (accept/decline/maybe). Admins can delete invitations; editors can open the edit modal.

### `InvitationListComponent`

A standalone list view of invitations with search, tag, and state filters. Supports add/edit/delete actions via the store.

### `InvitationEditModalComponent`

An Ionic modal for editing an `InvitationModel`. Opened by `InvitationStore.edit()`.
