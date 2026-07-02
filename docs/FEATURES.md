# Feature Overview

Angular 20 / Ionic 8 multi-tenant community platform on Firebase, organized as a Nx monorepo. Content is structured as **Pages → Sections** (CMS), and feature domains follow the `data-access | feature | ui | util` layer convention with `@bk2/<domain>-<layer>` import aliases.

## Apps

| App | Description |
|---|---|
| `scs-app` | Primary Angular/Ionic app for web and mobile (Capacitor 7 / iOS). |
| `test-app` | Secondary Angular app used for testing and isolated trials. |
| `functions` | Firebase Cloud Functions (Node.js, esbuild) — auth bridges, Matrix credentials, replication, and external integrations. |

## Core Platform

| Feature | Purpose |
|---|---|
| **Auth** (`libs/auth`) | Firebase Authentication (email/password), password reset, role-based authorization via `UserModel.roles` and `hasRole()`. Route guards: `isAuthenticatedGuard`, `isPrivilegedGuard`, `isAdminGuard`. |
| **User / Profile / Avatar** (`libs/user`, `libs/profile`, `libs/avatar`) | User account, profile editing, avatar rendering. `UserModel` is mapped to a `PersonModel` via `personKey`. |
| **Session** (`libs/session`) | User session state and lifecycle. |
| **App state** (`libs/shared/feature` → `AppStore`) | NgRx Signal Store holding Firebase auth state, current user, app config, and commonly needed reference data (categories, groups, orgs, persons, resources). |

## CMS

| Feature | Purpose |
|---|---|
| **Pages** (`libs/cms`) | `PageModel` defines an ordered list of section keys and a `type` (`content`, `dashboard`, `blog`, `chat`, `landing`, …). `PageDispatcher` resolves the page from `PageStore` and renders the correct page component. |
| **Sections** (`libs/cms`) | `SectionDispatcher` switches on `section.type` to render 20+ section types: `article`, `gallery`, `calendar`, `chat`, `map`, `people`, `tracker`, and more. |

## Subjects & Relationships

| Feature | Purpose |
|---|---|
| **Subject** (`libs/subject`) | Persons, organizations, and groups — the core entities of the platform. |
| **Relationship** (`libs/relationship`) | Links between subjects: memberships, affiliations, and other associations. |
| **Category** (`libs/category`) | Shared reference categories used across domains. |

## Communication

| Feature | Purpose |
|---|---|
| **Chat** (`libs/chat`) | Matrix-based chat. Firebase ID token is exchanged for Matrix credentials via the `getMatrixCredentials` Cloud Function. |
| **Comment** (`libs/comment`) | Discussion threads attached to content. |
| **Social Feed** (`libs/social-feed`) | Activity / social feed stream. |

## Productivity & Operations

| Feature | Purpose |
|---|---|
| **Task** (`libs/task`) | Task lists with quick-entry triggers (`@` for people, `//` for shortcuts). |
| **Calendar Events** (`libs/calevent`) | Event scheduling and calendar views. |
| **Activity / AoC** (`libs/activity`, `libs/aoc`) | Activity tracking and Articles of Constitution / organizational records. |
| **Finance** (`libs/finance`) | Financial records and accounting data. |
| **Quiz** (`libs/quiz`) | Quizzes and interactive assessments. |

## Content & Assets

| Feature | Purpose |
|---|---|
| **Document** (`libs/document`) | Document records and metadata. |
| **Folder** (`libs/folder`) | Folder hierarchy for organizing content. |
| **Resource** (`libs/resource`) | Bookable / shared resources. |
| **Icon** (`libs/icon`) | Icon registry (loaded by URL from the database; rendered via the `SvgIconPipe`). |
| **Geo** (`libs/geo`) | Geographic data and map integration. |

## Cloud Functions (`apps/functions/src`)

| Module | Purpose |
|---|---|
| `auth` | Auth helpers and custom claims. |
| `matrix`, `matrix-simple` | Matrix credential exchange for chat. |
| `oidc-bridge` | OIDC bridging for federated logins. |
| `replication` | Cross-system data replication. |
| `bexio` | Bexio accounting/CRM integration. |
| `zefix` | Swiss commercial registry (Zefix) lookups. |
| `calendar`, `email`, `address`, `location` | External service integrations. |
| `flighttracker` | Flight tracking integration. |
| `rag` | Retrieval-augmented generation endpoints. |
| `task`, `session`, `srv`, `assets`, `test` | Supporting/back-office endpoints. |

## Shared Libraries (`libs/shared`)

`models`, `config`, `constants`, `categories`, `data-access` (the single `FirestoreService` gateway — SSR-guarded, `shareReplay` caching, `rxfire` streams), `feature` (`AppStore`), `ui`, `pipes`, `i18n` (Transloco, default language `de`), `util-core`, `util-angular`, `util-functions`.

## Cross-cutting Architecture

- **Multi-tenancy** — every model has `tenants: string[]`; all Firestore queries filter by `tenantId`.
- **State** — NgRx Signal Stores throughout (`AppStore` + per-feature stores like `PageStore`, `MatrixChatStore`).
- **Forms** — `ngx-vest-forms` with Angular template-driven forms; vest validations live in each feature's `util` lib.
- **Angular** — zoneless change detection, standalone components only, Ionic standalone components, no NgModules.
- **Testing** — Vitest (jsdom, `globals: true`).
- **i18n** — Transloco, keys use `@domain.key` format.
