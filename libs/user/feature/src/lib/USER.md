# User Domain

## Overview
`UserModel` links a Firebase Authentication account to a `PersonModel` and stores application-level settings and role-based authorization. Every user belongs to exactly one tenant. The `bkey` matches the Firebase Auth UID.

The user domain covers two concerns:
1. **Admin management** — `UserListComponent` + `UserListStore` + `UserEditPage` + `UserEditStore` for admins to view and edit all user accounts.
2. **Firebase Auth management** — `FbuserEditModalComponent` for viewing/editing the raw Firebase Auth account (email, displayName, emailVerified, disabled).

## Firestore Collection
Collection name: `users`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID = Firebase Auth UID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; always exactly one tenant per user |
| `loginEmail` | string | Firebase Auth login email address |
| `personKey` | string | Foreign key to the linked `PersonModel.bkey` |
| `firstName` | string | Denormalized first name (copied from linked person) |
| `lastName` | string | Denormalized last name (copied from linked person) |
| `roles` | Roles | Role map; keys are role names, values are `true` when assigned |
| `isArchived` | boolean | Soft-delete flag |
| `notes` | string | Free-text notes |
| `tags` | string | Space-separated chip tags |
| `index` | string | Search index string |
| `useTouchId` | boolean | User preference: enable Touch ID |
| `useFaceId` | boolean | User preference: enable Face ID |
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
| `usageImages` | PrivacyUsage | Privacy: who can see the user's images |
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
The `FbuserEditModalComponent` shows and edits the underlying Firebase Auth record directly. Fields: `uid`, `email`, `displayName`, `emailVerified`, `disabled`, `phone`, `photoUrl`. This model is not stored in Firestore — it is read/written via Firebase Admin SDK through a Cloud Function or directly in the admin console.

## Stores

### `UserListStore`
Loads all users for the current tenant ordered by `loginEmail`.

#### State
| Property | Type | Description |
|---|---|---|
| `searchTerm` | string | Free-text filter against `index` |
| `selectedTag` | string | Tag chip filter |

#### Key Methods
| Method | Description |
|---|---|
| `edit(user, readOnly)` | Navigates to `/user/<bkey>` |
| `delete(user, readOnly)` | Deletes the user document |
| `export(type)` | Exports users as XLSX (`'raw'` or `'users'` format) |

### `UserEditStore`
Manages a single user detail page. Loaded by `userKey` input.

#### State
| Property | Type | Description |
|---|---|---|
| `userKey` | string \| undefined | Key of the user being edited |

#### Key Methods
| Method | Description |
|---|---|
| `setUserKey(key)` | Triggers reload of the user resource |
| `save(user)` | Creates or updates the user; navigates back on success |

## Components
| Component | Description |
|---|---|
| `UserListComponent` | List with search and tag filters; actions via ActionSheet (edit, delete, export) |
| `UserEditPageComponent` | Full edit page for a single user's settings and roles |
| `FbuserEditModalComponent` | Ionic modal to view/edit raw Firebase Auth account fields |

## Validation (`@bk2/user-util`)
Vest suites: `user` (full model), `userModelForm`, `userAuthForm`, `userNotificationForm`, `userPrivacyForm`, `userDisplayForm`, `fbuserForm`.

## Authorization
- List / view: requires `'admin'` role
- Edit / delete: requires `'admin'` role
