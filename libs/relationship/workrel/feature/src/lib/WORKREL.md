# Work Relationship Domain

## Overview

The `Workrel` (Work Relationship) entity models the employment or collaboration relationship between a person (or organisation) and an organisation. It covers employees, freelancers, contractors, interns, volunteers, board members, and inter-organisational relationships such as cooperations, sponsorships, and partnerships. It is time-bounded with `validFrom`/`validTo` dates.

## Firestore Collection

Collection name: `workrels`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `tags` | string | Comma-separated tags |
| `name` | string | Name of the work relationship (e.g. project name, job title, activity description) |
| `notes` | string | Internal notes |
| `subjectKey` | string | Key of the person or org that takes the work (employee/contractor side) |
| `subjectName1` | string | Last name or first part of the subject's name (denormalized) |
| `subjectName2` | string | First name or second part (denormalized) |
| `subjectModelType` | `'person' \| 'org'` | Discriminator for the subject entity type |
| `subjectType` | string | Gender (for persons) or org type |
| `objectKey` | string | Key of the org that gives work (employer side) |
| `objectName` | string | Name of the employer organisation (denormalized) |
| `objectType` | string | Type of the employer organisation |
| `type` | string | Work relationship type key — from `workrel_type` category |
| `label` | string | Custom label / job title / description of activity |
| `validFrom` | StoreDate | Start date of the work relationship |
| `validTo` | StoreDate | End date of the work relationship |
| `price` | number | Salary or rate |
| `currency` | string | ISO 4217 currency code (e.g. `CHF`) |
| `periodicity` | string | Payment periodicity key (e.g. `monthly`, `hourly`) — from `periodicity` category |
| `order` | number | Waiting-list order (relevant when state is `applied`) |
| `state` | string | Work relationship state key — from `workrel_state` category |

## Work Relationship Types

Configured via the `workrel_type` category list. Typical person-side values:

| Type | Description |
| --- | --- |
| `employee` | Full or part-time employee |
| `freelancer` | Freelancer |
| `contractor` | Contractor |
| `internship` | Intern / Praktikant |
| `trainee` | Trainee / Lehrling |
| `volunteer` | Volunteer / Freiwilliger |
| `boardMember` | Board member / Vorstand |
| `teacher` | Teacher |

Typical org-side values: `cooperation`, `competitor`, `supplier`, `customer`, `partner`, `sponsor`, `donor`.

## Store: `WorkrelStore`

An NgRx Signal Store managing work relationships, supporting two parallel loading modes: by person (workrels of a person) and by org (workers of an org).

**Key state fields:**

| Field | Description |
| --- | --- |
| `personKey` | When set, loads work relationships for this person; mutually exclusive with `orgKey` |
| `orgKey` | When set, loads workers for this org; mutually exclusive with `personKey` |
| `showOnlyCurrent` | When true, shows only currently valid relationships (via `isValidAt`) |
| `searchTerm` / `selectedTag` / `selectedType` / `selectedState` | Filter state |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allWorkrels` / `currentWorkrels` / `workrels` | Workrels keyed by person, with `showOnlyCurrent` filter |
| `allWorkers` / `currentWorkers` / `workers` | Workers keyed by org, with `showOnlyCurrent` filter |
| `filteredWorkrels` | `workrels` filtered by searchTerm, state, type, and tag |

**Key methods:**

| Method | Description |
| --- | --- |
| `setPersonKey(personKey)` | Scopes to a person and reloads |
| `setOrgKey(orgKey)` | Scopes to an org and reloads |
| `setShowMode(showOnlyCurrent)` | Toggles current/all view |
| `add(readOnly)` | Creates a new `WorkrelModel` pre-filled with current person and default org, opens edit modal |
| `edit(workrel, readOnly)` | Opens `WorkrelEditModalComponent` |
| `end(workrel?, readOnly)` | Picks an end date and sets `validTo` |
| `delete(workrel?, readOnly)` | Confirms and hard-deletes a work relationship |

## Components

### `WorkrelEditModalComponent`

An Ionic modal for creating or editing a `WorkrelModel`. Receives `workrel`, `currentUser`, `tags`, `types`, `states`, `periodicities`, `tenantId`, `readOnly`.
