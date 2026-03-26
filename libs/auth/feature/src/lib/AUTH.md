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

## Role Hierarchy
Roles are checked with the `hasRole(roleName, user)` utility from `@bk2/shared-util-core`. The effective hierarchy (lowest to highest) is:

```
anonymous < registered < privileged < admin
```

Admin roles (`contentAdmin`, `resourceAdmin`, `eventAdmin`, `memberAdmin`, `groupAdmin`, `treasurer`) are lateral specializations that do not imply each other.

## Guard Usage Examples
```ts
// Protect a route for any authenticated user
{ path: 'dashboard', canActivate: [isAuthenticatedGuard] }

// Protect admin-only routes
{ path: 'admin', canActivate: [isAdminGuard()] }

// Protect privileged routes
{ path: 'reports', canActivate: [isPrivilegedGuard()] }
```
