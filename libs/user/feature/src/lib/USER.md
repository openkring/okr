# User Domain

## Overview

`UserModel` links a Firebase Authentication account to a `PersonModel` and stores application-level settings and role-based authorization. Every user belongs to exactly one tenant. The `okey` matches the Firebase Auth UID.

The user domain covers two concerns:

1. **Admin management** — «Benutzer & Zugänge» (`/user/all/c-users`, admin): `UserList` + `UserStore` merge the logins, users and active members into rows (`buildUserAccountRows`); each row's ActionSheet (`UserAccountActions`, offers per `actionsForRow`) carries every account tool of the former AOC pages «User Accounts» and «Berechtigungen» (spec 1.101 phase 4). `UserEditModal` edits a user in three segments (Profil · Rollen · Einstellungen). The old `/user/:userKey` url redirects to the list with `?edit=<userKey>`, which opens the modal.
2. **Firebase Auth management** — `FbuserEditModal` for viewing/editing the raw Firebase Auth account (email, displayName, emailVerified, disabled).

## Firestore Collection

Collection name: `users`

## Field Semantics

| Field | Type | Description |
|---|---|---|
| `okey` | string | Firestore document ID = Firebase Auth UID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; always exactly one tenant per user |
| `loginEmail` | string | Firebase Auth login email address |
| `personKey` | string | Foreign key to the linked `PersonModel.okey` |
| `firstName` | string | Denormalized first name (copied from linked person) |
| `lastName` | string | Denormalized last name (copied from linked person) |
| `roles` | Roles | Role map; keys are role names, values are `true` when assigned |
| `isArchived` | boolean | Soft-delete flag |
| `notes` | string | Free-text notes |
| `tags` | string | Space-separated chip tags |
| `index` | string | Search index string |
| `userLanguage` | string | UI language code (default: app default language) |
| `avatarUsage` | AvatarUsage | How avatars are displayed (PhotoFirst, etc.) |
| `gravatarEmail` | string | Email used for Gravatar lookup |
| `nameDisplay` | NameDisplay | Display format for names (FirstLast, LastFirst, etc.) |
| `personSortCriteria` | PersonSortCriteria | Sort order for person lists (Lastname, etc.) |
| `newsDelivery` | DeliveryType | Preferred delivery method for newsletters |
| `invoiceDelivery` | DeliveryType | Preferred delivery method for invoices |
| `showArchivedData` | boolean | Setting: show archived records in lists |
| `showDebugInfo` | boolean | Setting: show debug information in the UI |
| `showHelpers` | boolean | Setting: show helper hints in forms |
| `usageImages` | PrivacyUsage | Photo declaration (D-P4-10): may the person be photographed / their picture published — organisational, not enforced |
| `usageDateOfBirth` | PrivacyUsage | Privacy: who can see date of birth |
| `usagePostalAddress` | PrivacyUsage | Privacy: who can see postal address |
| `usageEmail` | PrivacyUsage | Privacy: who can see email |
| `usagePhone` | PrivacyUsage | Privacy: who can see phone |
| `usageName` | PrivacyUsage | Privacy: who can see name |
| `srvEmail` | boolean | User consents to service emails |

## Role Names (`Roles` type)

| Role | Description |
|---|---|
| `anonymous` | Unauthenticated visitor |
| `registered` | Authenticated user |
| `privileged` | Elevated read access |
| `contentAdmin` | Can manage CMS content |
| `resourceAdmin` | Can manage resources |
| `eventAdmin` | Can manage events/calendar |
| `memberAdmin` | Can manage persons, orgs, groups, memberships |
| `groupAdmin` | Can manage their own groups |
| `treasurer` | Can manage financial data |
| `admin` | Full access |

## Firebase User (`FirebaseUserModel`)

The `FbuserEditModal` shows and edits the underlying Firebase Auth record directly. Fields: `uid`, `email`, `displayName`, `emailVerified`, `disabled`, `phone`, `photoUrl`. This model is not stored in Firestore — it is read/written via Firebase Admin SDK through a Cloud Function or directly in the admin console.

## Stores

### `UserStore`

Loads all users for the current tenant ordered by `loginEmail`.

#### State

| Property | Type | Description |
|---|---|---|
| `searchTerm` | string | Free-text filter against `index` |
| `selectedTag` | string | Tag chip filter |
| `problems` | boolean | «Probleme» chip: only the problem rows |
| `extendedRoles` | boolean | «Erweiterte Rollen» chip: only rows with a role besides `registered` |

#### Key Methods

| Method | Description |
|---|---|
| `edit(user, readOnly)` | Opens `UserEditModal` and saves the user (and the person's usage* flags) |
| `export(type)` | Exports users as XLSX (`'raw'` or `'users'` format) |

## Components

| Component | Description |
|---|---|
| `UserList` | «Benutzer & Zugänge»: every row (normal and problem rows) as avatar + name · login email · problem badge or extended roles. Search, tag, «Probleme» (problem rows only) and «Erweiterte Rollen» (any role besides `registered`) narrow that full list and combine. Row actions via `UserAccountActions` |
| `UserEditModal` | Edit modal for one user (segments Profil · Rollen · Einstellungen) |
| `FbuserEditModal` | Ionic modal to view/edit raw Firebase Auth account fields |

## «Zugang prüfen» (row action «Berechtigung prüfen»)

The report (`accountCheckFindings`) repairs what it finds: a missing email gets «E-Mail erfassen»
(a favourite email address for the person), a missing user «Konto eröffnen», a missing login
«Login eröffnen» — both through `openPersonAccount` (`syncPersonAccount`), which recreates a lost
login under the user's own uid (users/{uid} doc id = Auth uid). The roles are chips, saved on every
change. After a repair the check opens again on the reloaded rows.

## Validation (`@okr/user-util`)

Vest suites: `user` (full model), `userModelForm`, `userAuthForm`, `userNotificationForm`, `userPrivacyForm`, `userDisplayForm`, `fbuserForm`.

## Authorization

- List / view: requires `'admin'` role
- Edit / delete: requires `'admin'` role
