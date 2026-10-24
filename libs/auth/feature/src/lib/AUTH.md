# Auth Domain

## Overview

The auth domain handles Firebase Authentication for the application. It provides login, password reset, and OIDC callback pages, route guards for authorization, and a modal variant of the login form. Authentication state is tracked globally by `AppStore` via `rxfire/auth`.

There is no Firestore collection owned by this domain. After successful login the `AppStore` loads the `UserModel` from the `users` collection.

## Pages and Components

### `LoginPage` (`login.page.ts`)

Full-page login form. Displays the tenant's logo and welcome banner image (served via Imgix). Collects `loginEmail` + `loginPassword` via `LoginForm` from `@okr/auth-ui`. On submit calls `AuthService.login()` which signs in with Firebase Auth and redirects to `AppConfig.rootUrl` on success, or back to `AppConfig.loginUrl` on failure.

### `LoginModal` (`login.modal.ts`)

Ionic modal variant of the login form. Used when login needs to be embedded without full page navigation.

### `PasswordResetPage` (`password-reset.page.ts`)

Accepts an email address and calls `AuthService.resetPassword()`, which sends a Firebase password-reset email and redirects to `AppConfig.loginUrl`.

### `ConfirmPasswordResetPage` (`confirm-password-reset.page.ts`)

Handles the Firebase email-action link flow for completing a password reset.

> **Removed (C-3):** the `MatrixOidcCallback` component and the OIDC bridge it
> served were deleted. Matrix authentication uses the token-exchange approach
> (`getMatrixCredentials`); there is no OIDC/SSO redirect flow.

## Route Guards

### `isAuthenticatedGuard` (`isAuthenticated.guard.ts`)

`CanActivateFn`. Uses `rxfire/auth`'s `authState()` to check whether a Firebase user is currently signed in. Takes only the first emission (`take(1)`). Redirects to `/auth/login` if unauthenticated.

### `isPrivilegedGuard` (`isPrivileged.guard.ts`)

`CanActivateFn` factory. Returns `true` when `hasRole('privileged', currentUser)` is true. Relies on `AppStore.currentUser()`.

### `isAdminGuard` (`isAdmin.guard.ts`)

`CanActivateFn` factory. Returns `true` when `hasRole('admin', currentUser)` is true. Relies on `AppStore.currentUser()`.

## AuthService (`@okr/auth-data-access`)

The `AuthService` is injected by `LoginPage` and `PasswordResetPage`. Key responsibilities:

- `login(credentials, rootUrl, loginUrl)` — Firebase `signInWithEmailAndPassword`; redirects on success/failure.
- `resetPassword(email, loginUrl)` — Firebase `sendPasswordResetEmail`.

## Auth Credentials Model (`AuthCredentials`)

Defined in `@okr/shared-models`:

```ts
{ loginEmail: string; loginPassword: string; }
```

Validated by the `authCredentials` Vest suite in `@okr/auth-util`.

## Passkey login (spec 1.120, phase 1)

Users sign in with Face ID, Touch ID, Android fingerprint or Windows Hello (WebAuthn) instead of a password. Web and installed PWA only; the native (Capacitor) app hides all passkey UI in phase 1 (phase 2 = `@capgo/capacitor-passkey`).

### The `passkey` Cloud Function

One router callable (`apps/functions/src/auth/passkey.ts`), selected by `op`:

| op | Auth | Does |
| --- | --- | --- |
| `registerOptions` | signed in, sign-in within 5 minutes | creates a challenge, excludes already registered credentials |
| `registerVerify` | signed in | verifies the attestation, stores the `passkeys` doc, mails the account holder |
| `loginOptions` | none (App Check) | creates a challenge for the `rpId` |
| `loginVerify` | none (App Check) | verifies the assertion, returns a custom token (like `loginWithLoginId`) |
| `list` | owner or tenant admin | lists the passkeys of a user |
| `rename` | owner | changes the label |
| `delete` | owner or tenant admin | deletes one passkey |

- Every `loginVerify` failure answers one generic `unauthenticated` error, no earlier than 900 ms after the request.
- Challenges are single use and expire after 5 minutes (`webauthn-challenges`, TTL field `expireAt`).
- Passkeys live in the flat `passkeys` collection, document id = credential id. Both collections are server-only in `firestore.rules`; all access, including `list` and `rename`, goes through the router.
- Extra error codes: `invalid-argument` (`registerVerify`), `already-exists` (credential already registered).

### Relying party

`rpId` = `app-config/{tenantId}.appDomain`. `localhost` is accepted only from an `http://localhost` origin. A change of `appDomain` orphans all passkeys of that tenant: users fall back to the password and register again.

### Rules

- D4: adding a passkey requires a sign-in within the last 5 minutes. The client asks for the password; Benutzername accounts re-sign-in through `loginWithLoginId`.
- D6: every new passkey sends a mail to the account holder (skipped for synthetic login emails).
- Admin revoke: «Benutzer & Zugänge» row ActionSheet → «Passkeys» → delete. Deleting the Firebase login (`deleteFirebaseAuthUser`) cascades to the user's passkeys.

### Known gaps

- Passkeys are not part of data export or erasure yet (marked `gap` in `apps/functions/src/privacy/subject-data-map.ts`).
- The Firestore TTL policy must be created by hand:
  `gcloud firestore fields ttls update expireAt --collection-group=webauthn-challenges --enable-ttl`.

### Manual test

1. Run `pnpm nx serve scs-app` with the functions deployed to a test revision.
2. Add a passkey in the profile; the notice mail arrives.
3. Log out; «Mit Passkey anmelden» signs in; «Zuletzt verwendet» updates.
4. Rename the passkey, then delete it; logging in with it now fails with the generic message.
5. Cancel the OS prompt once on each path (add, login); no error toast appears.

---

## Role System

Roles are stored on `UserModel.roles` as a `Roles` object (a map of `boolean` flags). A user can hold multiple roles simultaneously. Checked via `hasRole(roleName, user)` from `@okr/shared-util-core`.

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
| `usageImages` | published / members only / no publication | — (declaration, see below) |

Fields not listed here (gender, tax ID, IBAN, notes, etc.) are always governed by the tenant default only.

**`usageImages` is not an accessor** (D-P4-10): it records the person's declaration about being
photographed and about publication of their picture, addressed to the photographer and the
contentAdmin. It maps to no rule and gates no read — avatar bytes are served unsigned from the
imgix CDN regardless. Consult it before publishing member pictures; never present it as a
technical restriction.

### Effective Accessor

The **effective accessor** for a field is the stricter of the two layers:

```text
effectiveAccessor = stricterAccessor(appConfig.showXXX, privacyUsageToAccessor(user.usageXXX))
```

`stricterAccessor` picks whichever requires the higher role. If a person sets their date of birth to *Protected* (`privileged`) but the app default is `registered`, only `privileged` users and above will see it.

This is computed by `AppStore.getPersonPrivacySettings(personUserModel?)` (`@okr/shared-feature`), which returns a `PrivacySettings` object with the merged effective accessors.

### Visibility Check

All views call `isVisibleToUser(privacyAccessor, currentUser)` from `@okr/shared-util-core`:

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
