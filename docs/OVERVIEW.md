# Project Summary

Angular 20 / Ionic 8 monorepo (Nx, pnpm, Firebase backend) — a multi-tenant CMS + community platform organized as Pages → Sections, with 20+ section types.

## Apps (`apps/`)

- **`scs-app`** — primary mobile/web Angular/Ionic app (Capacitor for iOS).
- **`test-app`** — secondary/testing Angular app.
- **`functions`** — Firebase Cloud Functions (Node/esbuild). Modules: `auth`, `matrix`, `matrix-simple`, `oidc-bridge`, `replication`, plus integrations: `bexio`, `zefix`, `calendar`, `email`, `address`, `location`, `flighttracker`, `rag`, `session`, `task`, `srv`, `assets`, `test`.

## Feature domains (`libs/`)

Each follows the `data-access | feature | ui | util` layer convention with `@bk2/<domain>-<layer>` import aliases.

| Domain | Purpose |
|---|---|
| `auth` | Firebase auth flows, login/reset |
| `user` / `profile` / `avatar` | Identity, user profile, avatar handling |
| `subject` | Persons, orgs, groups (core entities) |
| `relationship` | Links between subjects (memberships, etc.) |
| `cms` | Pages, sections, dispatchers |
| `chat` | Matrix-based chat |
| `calevent` | Calendar events |
| `task` | Task lists (recently extended with `@`/`//` quick-entry) |
| `activity` / `aoc` | Activity tracking |
| `finance` | Financial records |
| `resource` / `document` / `folder` | Asset/file management |
| `comment` / `social-feed` | Engagement |
| `quiz` | Quizzes |
| `category` / `icon` / `geo` | Reference data |
| `session` | User session state |

## Shared (`libs/shared`)

`models`, `config`, `constants`, `categories`, `data-access` (FirestoreService gateway), `feature` (root `AppStore`), `ui`, `pipes`, `i18n` (Transloco, default `de`), `util-core`, `util-angular`, `util-functions`.

## Key architecture

- **State**: NgRx Signal Stores (root `AppStore` + per-feature stores).
- **Data**: `FirestoreService` — single Firestore gateway, SSR-guarded, multi-tenant via `tenants: string[]`.
- **CMS**: `PageDispatcher` → `SectionDispatcher` route content by `type`.
- **Auth**: Firebase Auth → `UserModel.roles`; chat via Matrix credentials exchange in a Cloud Function.
- **Angular**: zoneless, standalone components only, Vitest for tests.
