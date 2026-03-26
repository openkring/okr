# Personal Relationship Domain

## Overview

The `PersonalRel` entity models a personal relationship between two persons — covering family ties, partnerships, friendships, professional relationships (teacher/student, doctor/patient), and more. It supports time-bounded relationships with `validFrom`/`validTo` dates and is primarily used to build ancestry graphs and track civil status.

## Firestore Collection

Collection name: `personal-rels`

## Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index |
| `tags` | string | Comma-separated tags |
| `notes` | string | Internal notes |
| `subjectKey` | string | Key of the first person (subject) |
| `subjectFirstName` | string | First name of the subject (denormalized) |
| `subjectLastName` | string | Last name of the subject (denormalized) |
| `subjectGender` | string | Gender of the subject (denormalized) |
| `objectKey` | string | Key of the second person (object) |
| `objectFirstName` | string | First name of the object person (denormalized) |
| `objectLastName` | string | Last name of the object person (denormalized) |
| `objectGender` | string | Gender of the object person (denormalized) |
| `type` | string | Relationship type key (see below) |
| `label` | string | Custom label for non-standard relationship types |
| `validFrom` | StoreDate | Start date of the relationship |
| `validTo` | StoreDate | End date of the relationship |

## Relationship Types

The `type` field uses the `personalrel_type` category list. Typical values include:

| Type key | Description |
| --- | --- |
| `partner` | Partnership / civil partnership |
| `married` | Marriage |
| `family` | Family relationship (generic) |
| `parent` | Parent–child (subject is parent) |
| `sibling` | Sibling relationship |
| `friend` | Friendship |
| `known` | Acquaintance |
| `godparent` | Godparent–godchild |
| `sponsor` | Sponsor–sponsee |
| `mentor` | Mentor–mentee |
| `teacher` | Teacher–student |
| `doctor` | Doctor–patient |
| `therapist` | Therapist–client |

## Store: `PersonalRelStore`

An NgRx Signal Store managing personal relationships for a tenant or a specific person.

**Key state fields:**

| Field | Description |
| --- | --- |
| `person` | When set, the store loads only relationships involving this person |
| `showOnlyCurrent` | When true, shows only currently valid relationships (checked via `isValidAt`) |
| `searchTerm` | Free-text filter on the index field |
| `selectedTag` | Tag chip filter |
| `selectedPersonalRelType` | Filter by relationship type |

**Key computed signals:**

| Signal | Description |
| --- | --- |
| `allPersonalRels` | All personal relationships loaded by the resource |
| `currentPersonalRels` | Relationships currently valid (based on `validFrom`/`validTo`) |
| `personalRels` | Filtered by `showOnlyCurrent` |
| `filteredPersonalRels` | Further filtered by searchTerm, type, and tag |

**Key methods:**

| Method | Description |
| --- | --- |
| `setPerson(person)` | Sets the person scope; triggers reload of the person's relationships |
| `setShowMode(showOnlyCurrent)` | Toggles between current and all relationships |
| `add(readOnly)` | Creates a new `PersonalRelModel` pre-filled with the current person and opens the edit modal |
| `edit(personalRel, readOnly)` | Opens `PersonalRelEditModalComponent` |
| `end(personalRel?, readOnly)` | Picks an end date and sets `validTo` |
| `delete(personalRel?, readOnly)` | Confirms and hard-deletes the relationship |

## Components

### `PersonalRelEditModalComponent`

An Ionic modal for creating or editing a `PersonalRelModel`. Receives the following props: `personalRel`, `currentUser`, `tags`, `types` (CategoryListModel), `readOnly`.

### List / Accordion Components

Personal relationships are typically displayed embedded within person detail pages as an accordion showing the person's current or historical relationships, filtered by type.
