# Responsibility Domain

## Overview

The `Responsibility` entity models who is responsible for a given function (event type) within a subject entity (e.g. an organisation, group, or person). It supports delegation with a time-limited substitute.

## Firestore Collection

Collection name: `responsibilities`

## Field Semantics

| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Full-text search index, built from subject/responsible names and eventType |
| `subjectAvatar` | AvatarInfo | The entity that this responsibility relates to (org, group, person, resource) |
| `scope` | string? | Optional scope restriction — restricts this record to a specific type[.subType] of the subject (e.g. `senior` for a specific age group) |
| `eventType` | string | Key into the `categories` collection under `responsibility_event` (e.g. `president`, `treasurer`) |
| `responsibleAvatar` | AvatarInfo | The person or group who holds the responsibility |
| `delegateAvatar` | AvatarInfo? | Optional temporary substitute (person or group) |
| `delegateValidFrom` | StoreDate | Start of the delegation period |
| `delegateValidTo` | StoreDate | End of the delegation period |
| `validFrom` | StoreDate | Start of the responsibility |
| `validTo` | StoreDate | End of the responsibility |

## Delegation Logic

When a `delegateAvatar` is set and the current date falls within `[delegateValidFrom, delegateValidTo]`, the delegate is considered active and takes precedence over `responsibleAvatar`. The `isDelegateActive()` utility function checks this condition.

`getResponsibleFor()` resolves the effective responsible for a given subject+eventType, returning the delegate (if active) or the primary responsible otherwise.

## `responsible` Pipe

The `ResponsiblePipe` (selector: `responsible`) resolves the effective responsible person/group display name for use in templates.

**Usage:**
```html
{{ 'org.' + org.bkey | responsible : responsibilities() : 'president' }}
{{ 'org.' + org.bkey | responsible : responsibilities() : 'president' : 'senior' }}
```

The pipe argument format is `modelType.subjectKey`. If a delegate is currently active, the output includes a delegation suffix: `"Name (delegiert von OriginalPerson bis DD.MM.YYYY)"`.

## List IDs

The `ResponsibilityStore` and list components accept a `listId` input that filters the displayed responsibilities:

| Prefix | Example | Meaning |
|---|---|---|
| `all` | `all` | All responsibilities |
| `s_` | `s_org-key` | Filter by subject key |
| `r_` | `r_person-key` | Filter by responsible or delegate key |
| `e_` | `e_president` | Filter by event type |
