# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Angular/Ionic project using TypeScript, Firebase, and pnpm. Use Angular signals and inputs (not legacy patterns). Check existing patterns in the codebase before implementing new features.

## Commands

```sh
# Development
pnpm dev                          # serve the default app (scs-app)
pnpm nx serve <app>               # serve a specific app (e.g. test-app)

# Build
pnpm run build                    # production build of test-app
pnpm nx build <project>           # build specific project
pnpm run build:functions          # build Cloud Functions

# Test
pnpm run test <project>           # run tests for a project (e.g. pnpm run test shared-util-core)
pnpm run testlibs                 # run all library tests
pnpm nx test <project>            # run tests for a specific library

# Lint
pnpm run lint                     # lint all projects
pnpm nx lint <project>            # lint specific project

# Deploy
pnpm run deploy:functions         # build + deploy Cloud Functions to Firebase

# Environment setup (required before first run)
source ./apps/<app-dir>/.env      # load env vars (never commit .env)
ts-node ./set-env.js              # generate environment.ts from env vars
```

Run `pnpm nx show project <project>` to see all available targets for a project.

## Development Workflow

When making changes to TypeScript files, always run `npx tsc --noEmit` or the project's build command after edits to catch type errors immediately. Do not consider a task done until it compiles cleanly.

## Architecture

### Tech Stack (non-negotiable, I will mass git revert you)

- Frontend: Angular v20, TypeScript strict, Ionic/Angular 8.7, Capacitor 7.4
- Backend: Google Firebase using Firestore database, FCM, Auth, Storage, AppCheck
- Auth: Firebase Authentication with email and password. Users may reset their password anytime.
- Styling: scss

### Monorepo structure (Nx)

- `apps/scs-app` — main Angular/Ionic application
- `apps/test-app` — secondary application
- `apps/functions` — Firebase Cloud Functions (Node.js/esbuild)
- `libs/` — feature libraries following the `@bk2/<domain>-<layer>` import alias convention

### Library layer convention

Each domain is split into layers:

| Layer | Purpose |
|---|---|
| `data-access` | Services, Firestore queries, RxFire subscriptions |
| `feature` | Smart components, NgRx Signal Stores |
| `ui` | Dumb/presentational components |
| `util` | Pure functions, validators, model factory functions |

Cross-cutting domains: `shared/models`, `shared/config`, `shared/data-access`, `shared/feature`, `shared/ui`, `shared/util-core`, `shared/util-angular`, `shared/util-functions`, `shared/i18n`, `shared/pipes`.

Import paths are defined in `tsconfig.base.json` and all follow `@bk2/<library-name>`.

### State management

All global and feature state uses **NgRx Signal Stores** (`@ngrx/signals`). The root `AppStore` (in `@bk2/shared-feature`) holds:

- Firebase auth state (via `rxfire/auth`)
- Current user (`UserModel`) and their roles
- App config (`AppConfig`) loaded from Firestore
- Commonly needed reference data (categories, groups, orgs, persons, resources)

Feature-level stores (e.g. `PageStore`, `MatrixChatStore`) are in their respective `feature` libs.

### Data persistence

`FirestoreService` (`@bk2/shared-data-access`) is the single gateway for all Firestore CRUD. It enforces `isPlatformBrowser` guards (SSR safety), caches query Observables via `shareReplay`, and uses `rxfire/firestore` `collectionData`/`docData` for real-time streams.

All models stored in Firestore use `bkey` (document ID) that is stripped before write and re-attached on read. Every model has a `tenants: string[]` field for multi-tenancy isolation — queries always filter by `tenantId`.

### CMS / Page-Section pattern

Content is structured as Pages → Sections:

- A `PageModel` holds an ordered list of section keys and has a `type` (e.g. `content`, `dashboard`, `blog`, `chat`, `landing`).
- `PageDispatcher` (in `@bk2/cms-page-feature`) reads the route param, loads the page from `PageStore`, and switches on `page.type` to render the correct page component.
- Each page type renders a list of sections. `SectionDispatcher` switches on `section.type` (20+ types: `article`, `gallery`, `calendar`, `chat`, `map`, `people`, `tracker`, etc.) to render the correct section component.

### Authentication & authorization

Firebase Auth is used for authentication. After login, the `AppStore` loads the `UserModel` from Firestore. Role-based authorization is checked via role guards (`isAuthenticatedGuard`, `isPrivilegedGuard`, `isAdminGuard`). Roles are stored on `UserModel.roles` (`Roles` type).

Matrix chat authentication is done via a Firebase Cloud Function (`getMatrixCredentials`) that exchanges a Firebase ID token for Matrix credentials.

### Authorization

- UserModel is mapping users from Firebase authentication with PersonModels (foreign key personKey)
- UserModel.roles contains the roles of a user (type Roles).
- use hasRole(neededRole: RoleName) for authorization checks

### Angular specifics

- **Zoneless**: uses `provideZonelessChangeDetection()` (no `zone.js` in components)
- **Standalone components** only (no NgModules for components/pipes/directives)
- **Ionic Angular** for UI components and routing strategy
- **Transloco** for i18n (default language: `de`); translation keys use `@domain.key` format
- **SSR** is configured but Ionic hydration is intentionally disabled
- Test runner: **Vitest** (jsdom environment, `globals: true`)

### Naming conventions

#### Component names

- Name the files like this:  FEATURE[-purpose][.type].ts. Purpose may be edit/list/new/label etc. type may be e.g. pipe/model/validations/util/service/form/modal/store.
- Use the same structure in CamelCase to name the component e.g. feature-new.modal becomes FeatureNewModal
- avoid the usage of 'Component'. e.g. use FeatureNewModal instead of FeatureNewModalComponent.
- name the template like this bk-feature[-purpose][-type], e.g. bk-feature-new-modal.

#### Classes

- always use private | protected | public for all methods and variables


### Environment configuration

Environment file (`environment.ts`) is generated by `set-env.js` from environment variables or GCP Secret Manager — never commit them. In dev, load variables with `source ./apps/<app>/.env`. The `ENV` injection token provides `BkEnvironment` across the app.

The build process is prepared for deployment with AppHosting. That's why we have the GCP Secret manager in it. But later we had to convert back to Firebase Hosting because of incompatibility of Ionic with Angular Hydration. Thats why we generate the environment.ts file for both development and production environment. The GCP secrets are currently only used by the cloud functions.

All security sensitive configuration must be read from the environment. There is a file set-env.js, that writes the development or production environment file per app. Both set-env.js and environment.ts must not be git-committed. They are git-ignored. It is strictly forbidden to generate a config file with security sensitive information (e.g. API-keys, access tokens) into a file and to git-commit this.

### Cloud Functions

Located in `apps/functions/src/`. Organized into sub-modules: `auth`, `matrix`, `matrix-simple`, `oidc-bridge`, `replication`. Built with esbuild via `pnpm run build:functions` and deployed with `firebase deploy --only functions`

### Security

- CORS rules (Content security policies CSP) are configured in firebase.json in the project root.

### Deployment

- For development environment, use `pnpm nx build APP_NAME` and  `pnpm nx serve APP_NAME`.
- For production environment, use `pnpm nx build APP_NAME --configuration production` and deploy with `firebase deploy --only hosting:APP_NAME`
Production app name for scs-app is scs-app-54aef.
- Try to keep the bundle size low by lazy loading (with router config) components.
- First meaningful paint under 1 second.
- Do not use SSR or hydration nor Firebase App Hosting (Ionic/stencils are not ready with Angular hydration)

### QA

- use test runner vite for unit tests
- create unit tests for each util function (shared-util and feature/util)

### Patterns

- use ngx-vest-forms with Angular template driven forms and create vest validations in util component of the feature
- do only create form models if needed
- a feature typically consists of FEATURE-list.component.ts (a list view of FEATURE[]), FEATURE-edit.modal.ts using FEATURE.form.ts (in ui component of the feature) as well as FEATURE.store.ts (feature related store).
- for icons, do not use addIcons. Use SvgIconPipe instead with an svg image like this:
    `<ion-icon slot="start" src="{{'menu' | svgIcon }}" />`

### Hard Rules

- never install a new dependency without asking first
- never modify the database schema (shared-models) without asking first 
- api calls for external integrations should use a firebase cloud function where possible. This Cloud functions stores the access token securely and caches token as well as data for later requests.
- do not try to find icon assets in the code. The icons reside in the database and are loaded via url.

## Working Style

When exploring the codebase, limit exploration to 3-4 file reads before producing initial output or a plan. Always communicate what you're doing if exploration takes more than a few steps.

## Debugging

When fixing bugs, verify the root cause is in the correct file/service before making changes. Ask for clarification if the error source is ambiguous rather than guessing.