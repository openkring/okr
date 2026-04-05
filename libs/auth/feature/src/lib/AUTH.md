# Auth Domain

## Overview
The auth domain handles Firebase Authentication for the application. It provides login, password reset, and OIDC callback pages, route guards for authorization, and a modal variant of the login form. Authentication state is tracked globally by `AppStore` via `rxfire/auth`.

There is no Firestore collection owned by this domain. After successful login the `AppStore` loads the `UserModel` from the `users` collection.

## Pages and Components

### `LoginPageComponent` (`login.page.ts`)
Full-page login form. Displays the tenant's logo and welcome banner image (served via Imgix). Collects `loginEmail` + `loginPassword` via `LoginFormComponent` from `@bk2/auth-ui`. On submit calls `AuthService.login()` which signs in with Firebase Auth and redirects to `AppConfig.rootUrl` on success, or back to `AppConfig.loginUrl` on failure.

### `LoginModalComponent` (`login.modal.ts`)
Ionic modal variant of the login form. Used when login needs to be embedded without full page navigation.

### `PasswordResetPageComponent` (`password-reset.page.ts`)
Accepts an email address and calls `AuthService.resetPassword()`, which sends a Firebase password-reset email and redirects to `AppConfig.loginUrl`.

### `ConfirmPasswordResetPageComponent` (`confirm-password-reset.page.ts`)
Handles the Firebase email-action link flow for completing a password reset.

### `MatrixOidcCallbackComponent` (`matrix-oidc-callback.component.ts`)
Handles the OAuth2/OIDC redirect from the Matrix homeserver after SSO. Mounted at route `/auth/matrix-callback`.
- Reads `loginToken` and `state` query parameters.
- Verifies `state` against `sessionStorage.oidc_state` to prevent CSRF.
- Stores `loginToken` in `localStorage` as `matrix_login_token` and sets `sessionStorage.matrix_needs_token_exchange = 'true'` for the chat component to pick up.
- Redirects to `sessionStorage.matrix_return_url` (or `/` as fallback).

## Route Guards

### `isAuthenticatedGuard` (`isAuthenticated.guard.ts`)
`CanActivateFn`. Uses `rxfire/auth`'s `authState()` to check whether a Firebase user is currently signed in. Takes only the first emission (`take(1)`). Redirects to `/auth/login` if unauthenticated.

### `isPrivilegedGuard` (`isPrivileged.guard.ts`)
`CanActivateFn` factory. Returns `true` when `hasRole('privileged', currentUser)` is true. Relies on `AppStore.currentUser()`.

### `isAdminGuard` (`isAdmin.guard.ts`)
`CanActivateFn` factory. Returns `true` when `hasRole('admin', currentUser)` is true. Relies on `AppStore.currentUser()`.

## AuthService (`@bk2/auth-data-access`)
The `AuthService` is injected by `LoginPageComponent` and `PasswordResetPageComponent`. Key responsibilities:
- `login(credentials, rootUrl, loginUrl)` — Firebase `signInWithEmailAndPassword`; redirects on success/failure.
- `resetPassword(email, loginUrl)` — Firebase `sendPasswordResetEmail`.

## Auth Credentials Model (`AuthCredentials`)
Defined in `@bk2/shared-models`:
```ts
{ loginEmail: string; loginPassword: string; }
```
Validated by the `authCredentials` Vest suite in `@bk2/auth-util`.

---

## Role System

Roles are stored on `UserModel.roles` as a `Roles` object (a map of `boolean` flags). A user can hold multiple roles simultaneously. Checked via `hasRole(roleName, user)` from `@bk2/shared-util-core`.

### Role Hierarchy

The primary access levels from least to most privileged:

| Role | Description |
| --- | --- |
| `public` | Visible to everyone — authenticated or not. Used for content that requires no login. `hasRole('public')` always returns `true`. |
| `registered` | Any authenticated user. Granted when an account is created. Includes all higher roles (privileged, admin). |
| `privileged` | Trusted members with expanded read access to sensitive data. Includes admin. |
| `admin` | Full access. Includes all other roles by implication. |

> **Important:** `hasRole('registered', user)` returns `true` for privileged and admin users as well — each level inherits all permissions of lower levels.

### Admin Specializations

These roles are **lateral** — they grant specific operational permissions without implying each other or implying `privileged`. Each also implies `admin`.

| Role | Scope |
| --- | --- |
| `contentAdmin` | Create and edit CMS pages and sections. |
| `resourceAdmin` | Manage resources (boats, rooms, equipment). |
| `eventAdmin` | Create and edit calendar events. |
| `memberAdmin` | Manage memberships and member data. |
| `groupAdmin` | Manage groups and group members. |
| `treasurer` | Access financial data (IBAN, invoices, transfers). |

### Implementation

```ts
// libs/shared/util-core/src/lib/auth.util.ts
export function hasRole(role: RoleName, currentUser?: UserModel): boolean

// libs/shared/models/src/lib/roles.ts
export type Roles = {
  registered?: boolean;
  privileged?: boolean;
  contentAdmin?: boolean;
  resourceAdmin?: boolean;
  eventAdmin?: boolean;
  memberAdmin?: boolean;
  groupAdmin?: boolean;
  treasurer?: boolean;
  admin?: boolean;
};
```

### Guard Usage Examples

```ts
// Any authenticated user
{ path: 'dashboard', canActivate: [isAuthenticatedGuard] }

// Privileged or higher
{ path: 'reports', canActivate: [isPrivilegedGuard()] }

// Admin only
{ path: 'aoc', canActivate: [isAdminGuard()] }
```

---

## Privacy Settings

Sensitive personal data (date of birth, contact details, gender, etc.) is controlled by a two-layer privacy system. Both layers must allow access before a field is shown.

### Layer 1 — Tenant Default (`AppConfig`)

The tenant administrator sets default visibility per field in the `AppConfig` document in Firestore. These defaults apply to all persons unless overridden. Each field maps to a `PrivacyAccessor` (the minimum role required to see it):

| AppConfig field | Default | Description |
| --- | --- | --- |
| `showName` | `public` | First and last name |
| `showImages` | `public` | Profile photo / avatar |
| `showDateOfBirth` | `registered` | Date of birth |
| `showEmail` | `registered` | Favourite email address |
| `showPhone` | `registered` | Favourite phone number |
| `showPostalAddress` | `registered` | Favourite postal address |
| `showDateOfDeath` | `privileged` | Date of death |
| `showGender` | `privileged` | Gender |
| `showTaxId` | `privileged` | AHV / social security number |
| `showBexioId` | `privileged` | Bexio CRM reference ID |
| `showIban` | `privileged` | Bank account (IBAN) |
| `showTags` | `privileged` | Internal classification tags |
| `showMemberships` | `privileged` | Membership history |
| `showOwnerships` | `privileged` | Ownership records |
| `showComments` | `privileged` | Internal comments |
| `showDocuments` | `privileged` | Attached documents |
| `showNotes` | `admin` | Free-text notes |

### Layer 2 — Person's Own Preference (`UserModel`)

A person who has a `UserModel` (i.e. a registered user account) can tighten the visibility of their own data via the **Profile → Privacy** form. They can only restrict — never relax — the tenant default. The overridable fields are:

| UserModel field | Choices | Mapped accessor |
| --- | --- | --- |
| `usageName` | Public / Restricted / Protected | `public` / `registered` / `privileged` |
| `usageDateOfBirth` | Public / Restricted / Protected | `public` / `registered` / `privileged` |
| `usageEmail` | Public / Restricted / Protected | `public` / `registered` / `privileged` |
| `usagePhone` | Public / Restricted / Protected | `public` / `registered` / `privileged` |
| `usagePostalAddress` | Public / Restricted / Protected | `public` / `registered` / `privileged` |
| `usageImages` | Public / Restricted / Protected | `public` / `registered` / `privileged` |

Fields not listed here (gender, tax ID, IBAN, notes, etc.) are always governed by the tenant default only.

### Effective Accessor

The **effective accessor** for a field is the stricter of the two layers:

```
effectiveAccessor = stricterAccessor(appConfig.showXXX, privacyUsageToAccessor(user.usageXXX))
```

`stricterAccessor` picks whichever requires the higher role. If a person sets their date of birth to *Protected* (`privileged`) but the app default is `registered`, only `privileged` users and above will see it.

This is computed by `AppStore.getPersonPrivacySettings(personUserModel?)` (`@bk2/shared-feature`), which returns a `PrivacySettings` object with the merged effective accessors.

### Visibility Check

All views call `isVisibleToUser(privacyAccessor, currentUser)` from `@bk2/shared-util-core`:

```ts
// returns true if currentUser meets the minimum role required by privacyAccessor
isVisibleToUser(priv().showDateOfBirth, currentUser())
```

| `PrivacyAccessor` | Who can see it |
| --- | --- |
| `public` | Everyone (no login required) |
| `registered` | Any logged-in user |
| `privileged` | Privileged users and admins |
| `admin` | Admins only |

### Data Flow

```text
AppConfig.showXXX  ──┐
                      ├─► stricterAccessor ─► PrivacySettings.showXXX ─► isVisibleToUser ─► show/hide field
UserModel.usageXXX ──┘     (in AppStore)        (from store.priv())        (in template)
```

1. `AppStore.privacySettings()` — tenant defaults only (used when no specific person is loaded)
2. `AppStore.getPersonPrivacySettings(personUserModel)` — merged defaults + person's own preferences
3. Components receive a `priv = input<PrivacySettings>()` and call `isVisibleToUser(priv().showXXX, currentUser())` in the template

> **Note:** The viewed person's `UserModel` must be loaded separately to apply their overrides. Currently `person-edit.store` passes `undefined` (tenant defaults only). Loading the viewed person's user account by their `personKey` is a planned improvement.
