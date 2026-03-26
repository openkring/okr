# Membership Domain

## Overview

The `Membership` entity models the membership of a person, organisation, or group in an organisation or group. It supports hierarchical structures (org → org → group → person) and tracks the full history of membership changes via a linked-list (`order`, `relIsLast`, `relLog`). Memberships are the central relationship used for club administration: managing members, roles, dues, entries, exits, and waiting lists.

## Firestore Collection

Collection name: `memberships`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `tags` | string | Comma-separated tags |
| `notes` | string | Internal notes |
| `memberKey` | string | Key of the member (person, org, or group) |
| `memberName1` | string | First name of the person or company name part 1 |
| `memberName2` | string | Last name of the person or company name part 2 |
| `memberModelType` | `'person' \| 'org' \| 'group'` | Discriminator for the member entity type |
| `memberType` | string | Gender for persons; org type for orgs |
| `memberNickName` | string | Nickname of the person member |
| `memberAbbreviation` | string | Abbreviation (e.g. initials) |
| `memberDateOfBirth` | StoreDate | Date of birth (persons) |
| `memberDateOfDeath` | StoreDate | Date of death (persons; non-empty = deceased) |
| `memberZipCode` | string | Postal code of the member's address |
| `memberBexioId` | number | External Bexio CRM ID |
| `memberId` | number | Internal member ID number |
| `orgKey` | string | Key of the membership organisation (org or group) |
| `orgName` | string | Name of the organisation (denormalized) |
| `orgModelType` | `'org' \| 'group'` | Discriminator for the organisation entity type |
| `dateOfEntry` | StoreDate | Date the member joined |
| `dateOfExit` | StoreDate | Date the member left (future = still active) |
| `category` | string | Membership category key (e.g. `active`, `passive`, `honorary`) |
| `state` | string | Membership state key (e.g. `active`, `applied`, `passive`, `cancelled`) |
| `orgFunction` | string | Function/role within the organisation |
| `order` | number | Sequence index within a linked list of memberships for the same member+org (1 = first) |
| `relLog` | string | Change log of membership transitions (e.g. `20200715:J→A`) |
| `relIsLast` | boolean | Whether this is the most recent membership record in the linked list |
| `price` | MoneyModel? | Optional price that overrides the default from the membership category |

## Membership History (Linked List)

When a member's category changes (e.g. Junior → Active → Passive), a new `MembershipModel` record is created for each transition rather than updating the old record. The records are linked via `order` (ascending sequence number) and `relIsLast` (true only on the most recent record). `relLog` accumulates the change history as a pipe-separated string.

## Store: `_MembershipStore` / `MembershipStore`

A large NgRx Signal Store managing all membership data for a tenant.

**Key state fields:**

| Field | Description |
| --- | --- |
| `orgId` | Organisation key; filters which org's members are displayed |
| `orgType` | `'org'` or `'group'` |
| `listId` | Identifies the current list view (e.g. `active`, `exits`) |
| `showOnlyCurrent` | When true, shows only memberships where `dateOfExit` is in the future |
| `member` | Person, org, or group whose memberships are shown in an accordion |
| `modelType` | Discriminator for the `member` field |
| `searchTerm` / `selectedTag` / `selectedMembershipCategory` / `selectedGender` / `selectedOrgType` | Filter state |
| `selectedYear` | Year filter (for entries/exits views) |
| `yearField` | Whether to filter by `dateOfEntry` or `dateOfExit` |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allMemberships` | All memberships, filtered by `showOnlyCurrent` and `relIsLast` |
| `members` | Memberships belonging to the current `orgId` |
| `memberships` | Memberships of the current `member` (accordion use) |
| `personMembers` / `orgMembers` | Members split by model type |
| `activeMembers` / `passiveMembers` / `appliedMembers` / `cancelledMembers` | Members split by state |
| `deceasedMembers` | Members with a non-empty `memberDateOfDeath` |
| `entries` | New memberships (order === 1) entered up to the selected year |
| `exits` | Memberships that exited up to the selected year |
| `filteredPersons` / `filteredActive` / `filteredPassive` / etc. | Filtered sub-lists used by the list components |
| `membershipCategory` | `CategoryListModel` for the org's membership category key |
| `groupsOfMember` | Groups the current member belongs to |
| `ownershipsOfMember` | Active ownerships of the current person member |

**Key methods:**

| Method | Description |
| --- | --- |
| `setOrgId(orgId, orgType)` | Sets the active org and resets all filters |
| `setListId(listId)` | Sets the active list view |
| `add(readOnly)` | Opens `MemberNewModal` to create a new person + membership |
| `addMembership(member, readOnly)` | Opens `MembershipEditModalComponent` to add a membership to an existing member |
| `edit(membership, readOnly)` | Opens `MembershipEditModalComponent` to edit an existing membership |
| `changeCategory(membership, readOnly)` | Opens `CategoryChangeModalComponent` to change the membership category |
| `end(membership, readOnly)` | Picks a date and sets `dateOfExit`, ending the membership |
| `delete(membership?, readOnly)` | Confirms and hard-deletes a membership |
| `export(type)` | Exports membership data (e.g. to XLSX, Clubdesk import, SRV format) |

## Components

### `MembersComponent` (`bk-members`)

A flat list view of all members of a given org/group. Inputs: `orgKey` (required), `orgType`, `readOnly`. Tapping a member opens an ActionSheet with view/edit/end/delete actions. Privileged users see all historical memberships; others see only current ones.

### `MembersAccordionComponent`

An Ionic accordion embedding `MembersComponent` for use within a parent detail page.

### `MembershipListComponent`

A full-featured list view with segmented tabs (all, active, passive, applied, cancelled, deceased, entries, exits) and filters for category, gender, year, and tags.

### `MembershipEditModalComponent`

An Ionic modal for editing an existing `MembershipModel`.

### `MemberNewModal`

An Ionic modal for creating a new person together with their first membership in one step.

### `CategoryChangeModalComponent`

A focused modal for changing only the membership category, which creates a new linked-list record.

### `MembershipAccordionComponent`

An accordion showing the memberships of a single member (person/org/group), used in member detail pages.
