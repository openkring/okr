# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Angular/Ionic project using TypeScript, Firebase, and pnpm. Use Angular signals and inputs (not legacy patterns). Check existing patterns in the codebase before implementing new features.

## Skills

Invoke the matching skill **before** starting work in its area — each one carries the project-specific conventions and overrides general defaults.

| Skill                    | Use when…                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-feature`            | scaffolding a brand-new feature/entity — shared model (`FEATUREModelName`/`FEATURECollection`), the four layer libs (data-access/feature/ui/util), list + optional detail-page route, and the navigate/call/context `menuItems`.                                                                                     |
| `provision-tenant`       | spinning up a brand-new tenant app — new Firebase Web App + AppCheck, `app-config/{tenantId}` doc, `@okr/tools:app` scaffold, starter CMS content, git-ignored `.env`, and the first admin user (shared Firebase project).                                                                                           |
| `tenant-model`           | reasoning about multi-tenancy — the `tenants[]` isolation field, tenant-scoped queries, `app-config`, persons shared across tenants vs. single-tenant `users/{uid}`, and the roles model.                                                                                                                            |
| `address-model`          | creating/reading contact details — the flat `addresses` collection, `parentKey` link, `addressChannel` (email/phone/postal/web/bank, planned ssn/dob) → value-field mapping, and favorite-address replication.                                                                                                       |
| `privacy-model`          | working with personal data or privacy flags (`usage*`, `PrivacyUsage`, `PrivacyAccessor`, dob, ssn/AHV, iban), the privacy gate for new features, or revDSG questions — the addresses-as-PII-vault architecture (spec 1.19), channel sensitivity floors, projections, and what is NOT enforced today.                |
| `deleting-models`        | deleting/archiving a record (`delete()`, `archive()`, `isArchived`, batch or cascade delete) — the archive-vs-detach rule for docs shared across tenants, `getDeletePatch`, and the call sites that bypass `FirestoreService.deleteModel`.                                                                       |
| `i18n`                   | adding/translating/wiring any i18n string (keys, store wiring, labels to forms/ui, new-lib `de.json`, tenant overrides).                                                                                                                                                                                             |
| `icons`                  | rendering or choosing an icon, the `svgIcon` pipe, icon sets, or an icon shows blank.                                                                                                                                                                                                                                |
| `images`                 | uploading or displaying images/files — the `accept` list, adding a format (heic/webp/…), a file greyed out in the dialog, an upload that never shows in the album, thumbnails, or any imgix URL. Covers one-original-plus-imgix, the three mime lists, and the `resolveMimeType` rule.                                |
| `generating-lists`       | scaffolding a new feature list view (`FEATURE-list.ts`) — header, filters, list/grid, per-item ActionSheet actions.                                                                                                                                                                                                  |
| `building-forms`         | building/scaffolding a form **or any edit modal** (`FEATURE.form.ts`, `FEATURE-edit.modal.ts`, or a form-builder form) — the fixed modal structure (header + change-confirmation + content, never bespoke buttons/styles), Signal Forms + Vest validation, shared/ui field primitives, `valid`/`dirty` outputs, no submit button (parent drives saving via change-confirmation), i18n, autofocus/tab order, `ion-card`/`ion-grid size-md` layout, guarded chips/notes. Both form and modal live in the domain's `ui` lib. |
| `trips`                  | working on the Logbuch / trips feature — the trip list, the ActionSheet and who gets which action, the 15-minute edit window, the remote read-only lock (GESPERRT banner, admin lock/unlock), or an action that is missing or shows for the wrong role. Covers the two-rule authorization model (pre-empt gate → flat sheet), the fixed button order, and where the lock lives.                                            |
| `kiosk`                  | working on the kiosk device — the kiosk-only user (`roles.kiosk`), the route lock, kiosk call rooms, or remote monitoring (`kiosk-status` battery + heartbeat, and why battery needs the native iOS build).                                                                                          |
| `matrix-chat`            | working on Matrix chat — group rooms, DMs, the per-tenant support/Notfall room, room aliases, or a room visible in the wrong tenant. Also Synapse admin work (delete a stale room, stamp a tenant marker, claim an alias, audit rooms) and anywhere a group key or room alias is derived. Covers one-account-per-person, the `org.okr.tenant` marker, and the `matrixRoomId` > alias > name resolution order. |
| `notifications`          | working on push notifications or the app-icon badge — FCM payloads, `firebase-messaging-sw.js`, `setAppBadge` (absolute value, two writers), or a badge that is missing/stuck/won't clear.                                                                                                                            |
| `mailtrap`               | working on outgoing email — a reset mail that never arrives or arrives unstyled, a sender/`from` address, a Mailtrap template or UUID, adding a tenant to the mail provider, or auditing what was really delivered. Covers the two `app-config` fields (`emailDomain`, `mailtrapPasswordResetTemplate`), the 5-domain plan ceiling, the provider list, and the silent-success trap on the password-reset path. |
| `calendar`               | working on calevent dates/times that cross a boundary — the ICS export (`generateCalendarICS`), an import that lands 1–2h off in Outlook, FullCalendar rendering, recurring events, or an off-by-one full-day event. Covers the StoreDate/StoreTime local-wall-clock contract, the TZID+VTIMEZONE rule, and exclusive ends. |
| `menu`                   | working on navigation — a main/sub/context/toolbar menu entry, a menu row that won't render, the tenant sitemap (`graph` page), or the feature picker at `/tenant/features`. Covers the `menuItems` collection, lookup by `name`, the three visibility gates (`tenants[]` → feature block → role), catalogue-owned vs tenant-owned docs, and the fork-on-edit rule. |
| `group`                  | working with groups, memberships (`orgKey`/`orgModelType`), group admins, group calendars (`owner: group.<okey>`), or inviting group members to an event — plus the open-vs-closed attendance model (attendees list vs. invitations).                                                                                              |
| `new-section`            | creating a new CMS section type.                                                                                                                                                                                                                                                                                     |
| `firebase-deploy`        | deploying app/hosting, Cloud Functions, Firestore/Storage rules, or managing function secrets.                                                                                                                                                                                                                       |
| `dns`                    | mapping a custom domain/subdomain to a hosting site, adding a tenant domain, or a live domain serving the wrong content or a stale release — the apex+`www` = website / `app.<domain>` = app rule, the two A-record generations, the cross-origin CSP pair, and the `cleanUrls` entry-path caching trap.              |
| `url-scheme`             | reasoning about what appears in a URL — a proposal to encrypt/hash/obfuscate record ids in routes, a worry that an `okey`/`personKey`/UID is visible or guessable, a link meant to be shared/printed/QR-coded, or a route carrying user-supplied text. Covers the three route shapes, why id encryption is rejected, what URL encoding actually protects, the missing `Referrer-Policy`, and when the alias service is the right indirection. |
| `version`                | reasoning about version numbers — one monorepo version vs. per-app, the `app-version` doc fields (`deployed` map, `latestVersion`, global `minVersion`/`forceUpdate`), which version a client/ticket/Sentry event reports, and the backward-compatibility rule for staggered app deploys.                                        |
| `release`                | cutting a release — version bump + prod build + full test gate + hosting deploy + `app-version` update prompt + release commit/tag/push; or a functions/rules-only deploy. Orchestrates `firebase-deploy`.                                                                                                           |
| `website`                | editing/deploying/debugging the static marketing site (`scs-website`) served at `/web` — embedded-static pattern, self-hosted fonts + OFL licensing, the immutable-CSS cache-bust trap, the service-worker `connect-src` CSP gotcha, and why a `/web` change needs a hosting redeploy but no version bump.           |
| `brand-styleguide`       | creating/refreshing a tenant's `brand-styleguide.html` (logo, colors, typography, usage rules) — the bespoke `stage`/`card`/`grid`/`swatch`/`do-dont` CSS system, sourcing real logo/color/font inputs, and why not to wire it through the tenant site's Tailwind pipeline.                                          |
| `lazy-loading`           | getting a heavy library (echarts, @fullcalendar, leaflet, matrix-js-sdk, ngx-editor) out of an app's eager bundle, or a component that is `@defer`-ed while its library still loads on first paint — the rule that a **static import is the binding edge**, the two working patterns (dynamic `createComponent`, provider loader), and verifying with `bundle-closure.mjs` instead of guessing.                                            |
| `eslint`                 | linting or fixing lint errors (and the `nx lint` heap-OOM workaround).                                                                                                                                                                                                                                               |
| `fix-types`              | type-checking after editing TypeScript files.                                                                                                                                                                                                                                                                        |
| `testing`                | writing or running tests — Vitest unit tests (only for util functions and services) or Playwright e2e; includes the `@angular/compiler` JIT-error fix.                                                                                                                                                               |
| `authoring-docs`         | creating/saving a spec, design, or implementation plan doc.                                                                                                                                                                                                                                                          |
| `pending-implementation` | creating/updating/regenerating `planning/PENDING_IMPLEMENTATION.md` / `planning/DONE_IMPLEMENTATION.md` / `planning/LATER_IMPLEMENTATION.md` — the TOC of specified topics: open, completed, parked and cancelled.                                                                                                                              |
| `creating-help-videos`   | creating/updating a step-by-step help/tutorial/onboarding video for end users (login, password reset, …) — German storyboard + Sprechertext + screenshot-capture guide per `tenant/topic`, for desktop and mobile.                                                                                                   |
| `github-security`        | checking/configuring/accessing GitHub security on `openkring/okr` — Dependabot alerts & security updates, CodeQL code scanning, secret scanning & push protection — or looking up a GitHub security-alert email. Covers what's enabled and the `gh` CLI commands per alert type.                                     |
| `person-profile`         | looking up a person's professional profile by name (currently LinkedIn via the `mcp-server-linkedin` MCP server) — search by first/last name, disambiguate candidates (name + company + city), then return education, certifications, skills, projects, contact_info.                                                |
| `parallel-sessions`      | running several Claude/dev sessions on this repo at once, or reasoning about the branching strategy — per-session git worktrees, short-lived `work/<name>` branches (`pnpm session:new/sync/list/remove`), ff-merge back to `main`, and "another session moved main / changed my files".                             |
| `kring-knowledge`        | reasoning about the Kring brand family — the SaaS product Kring, the open-source project openkring, bkaiser GmbH, the five audience worlds (/club, /alumni, /steg, /coop, /kmu), pricing bands and add-ons, brand assets, trademark status, or any marketing/investor copy. The price itself stays normative in `planning/specs/2026-08-04-kring-pricing-spec.md`.                                                     |

### Documentation layout (`docs/`)

Docs are organised by **type**: `planning/ideas/` (seed/stub specs), `planning/specs/` (all spec & design docs,
kept here for their whole life), `planning/plans/` (implementation plans), `planning/reference/` (reference
docs). Specs are **not moved on completion**; status lives in `planning/PENDING_IMPLEMENTATION.md` (the TOC,
chapters 1–3), `planning/DONE_IMPLEMENTATION.md` (chapter 4, fully implemented) and
`planning/LATER_IMPLEMENTATION.md` (chapters 5–6, later · cancelled) via each entry's
`State:` field. `docs/done/` is retired (archive for superseded docs only).
**This overrides the superpowers defaults:** the `brainstorming` skill must save design docs to
`planning/specs/` and `writing-plans` must save plans to `planning/plans/` (not under `docs/superpowers/`).
See the `authoring-docs` skill for the full convention.

## Commands

```sh
# Build
pnpm nx build <app>           # build specific project in development environment
pnpm nx build <app> --configuration production          # build specific app for production environment and deployment
pnpm nx build functions --configuration production          # build Cloud Functions

# Test
pnpm run test <project>           # run tests for a project (e.g. pnpm run test shared-util-core)
pnpm run testlibs                 # run all library tests
pnpm nx test <project>            # run tests for a specific library

# Lint
pnpm run lint                     # lint all projects
pnpm nx lint <project>            # lint specific project

# Environment setup (required before first run)
# .env has no `export` lines, so a plain `source` does NOT reach node — use `set -a`.
# set-env.js also needs NX_TASK_TARGET_PROJECT, which Nx supplies when it runs the target.
set -a && source ./apps/<app-dir>/.env && set +a   # never commit .env
NX_TASK_TARGET_PROJECT=<app> NODE_ENV=development node ./set-env.js

# Usually unnecessary: `nx build`/`nx serve` run set-env.js themselves with the right variables.

# Serve locally
pnpm nx serve <app>               # serve a specific app (e.g. test-app) locally in development environment
```

For all deployment (app/hosting, functions, rules, secrets), use the **`firebase-deploy` skill** — e.g. `pnpm run deploy:functions` to ship Cloud Functions.

Run `pnpm nx show project <project>` to see all available targets for a project.

## Development Workflow

When making changes to TypeScript files, always run `npx tsc --noEmit` or the project's build command after edits to catch type errors immediately. Do not consider a task done until it compiles cleanly.

**CRITICAL — type-checking vs. building:**

- Type-check with `npx tsc --noEmit -p libs/<domain>/<layer>/tsconfig.json`. The `--noEmit` flag is mandatory. Never run `tsc` without it against a lib's `tsconfig.json`.
- Build with `pnpm nx build <lib>`, which uses `tsconfig.lib.json` and writes output to `dist/`.
- Every lib `tsconfig.json` must contain `"noEmit": true` in `compilerOptions`. This is a structural safeguard: even if `--noEmit` is accidentally omitted from the CLI, TypeScript will not emit files next to the sources. `tsconfig.lib.json` intentionally does NOT have `noEmit` — it is the only config that should ever produce output, and it writes to `dist/`.
- **Never run `tsc -b` or `tsc -p` against a `tsconfig.lib.json`.** Use `pnpm nx build <lib>` to build and `npx tsc --noEmit -p <lib>/tsconfig.json` to type-check. Only the `@nx/js:tsc` executor rewrites `@okr/*` to `dist/`; raw `tsc` resolves them to **source** via the `tsconfig.base.json` path map.
- Consequently, **every `tsconfig.lib.json` must list all of its `@okr/*` dependencies in `references`** — not just intra-domain siblings. Without a reference, the dependency's sources join the program, land outside `rootDir` (TS6059/TS6307), and `tsc` emits them next to their sources, scattering artifacts across `libs/`. Do not hand-maintain this: run `pnpm lib-refs:write` after adding or removing a cross-lib import. `pnpm lib-refs` checks without writing and exits non-zero when stale (CI-friendly).
- If you ever see `*.d.ts`, `*.js`, or `*.js.map` files inside `libs/` or `apps/src/`, they are stale artifacts. Delete them with `find libs -type f \( -name '*.d.ts' -o -name '*.js' -o -name '*.js.map' -o -name '*.tsbuildinfo' \) ! -path '*/node_modules/*' -delete`, then run `pnpm lib-refs` to find the missing references. **Scope that command to `libs/` only** — `apps/*/src` holds a git-tracked `firebase-messaging-sw.js` and a generated `firebase-config.js` that must not be deleted.

## Architecture

### Tech Stack (non-negotiable, I will mass git revert you)

- Frontend: Angular v20, TypeScript strict, Ionic/Angular 8.7, Capacitor 7.4
- Backend: Google Firebase using Firestore database, FCM, Auth, Storage, AppCheck
- Auth: Firebase Authentication with email and password. Users may reset their password anytime.
- Styling: scss

### Monorepo structure (Nx)

This is a **public core + private submodules** repository (`openkring/okr`). The core
(libs, functions, rules, public docs) is public; the tenant apps, planning docs, and
skills are private git submodules under `bkaiser-org` (empty for non-members).

- `apps` — Angular/Ionic applications (`apps/scs-app`, `apps/*-website` are **private submodules**)
- `apps/functions` — Firebase Cloud Functions (Node.js/esbuild) — part of the public core
- `libs/` — feature libraries following the `@okr/<domain>-<layer>` import alias convention (public core)
- `planning/` — specs, plans, ideas, video-producer — **private submodule** (`bkaiser-org/okr-planning`)
- `.claude/skills` — project skills — **private submodule** (`bkaiser-org/okr-skills`)

Members clone with `git clone --recurse-submodules git@github.com:openkring/okr.git`.

### Library layer convention

Each domain is split into layers:

| Layer         | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `data-access` | Services, Firestore queries, RxFire subscriptions   |
| `feature`     | Smart components, NgRx Signal Stores                |
| `ui`          | Dumb/presentational components                      |
| `util`        | Pure functions, validators, model factory functions |

Cross-cutting domains: `shared/models`, `shared/config`, `shared/data-access`, `shared/feature`, `shared/ui`, `shared/util-core`, `shared/util-angular`, `shared/util-functions`, `shared/i18n`, `shared/pipes`.

Import paths are defined in `tsconfig.base.json` and all follow `@okr/<library-name>`.

### State management

All global and feature state uses **NgRx Signal Stores** (`@ngrx/signals`). The root `AppStore` (in `@okr/shared-feature`) holds:

- Firebase auth state (via `rxfire/auth`)
- Current user (`UserModel`) and their roles
- App config (`AppConfig`) loaded from Firestore
- Commonly needed reference data (categories, groups, orgs, persons, resources)

Feature-level stores (e.g. `PageStore`, `MatrixChatStore`) are in their respective `feature` libs.

### Data persistence

`FirestoreService` (`@okr/shared-data-access`) is the single gateway for all Firestore CRUD. It enforces `isPlatformBrowser` guards (SSR safety), caches query Observables via `shareReplay`, and uses `rxfire/firestore` `collectionData`/`docData` for real-time streams.

All models stored in Firestore use `okey` (document ID) that is stripped before write and re-attached on read. Every model has a `tenants: string[]` field for multi-tenancy isolation — queries always filter by `tenantId`.

### CMS / Page-Section pattern

Content is structured as Pages → Sections:

- A `PageModel` holds an ordered list of section keys and has a `type` (e.g. `content`, `dashboard`, `blog`, `chat`, `landing`).
- `PageDispatcher` (in `@okr/cms-page-feature`) reads the route param, loads the page from `PageStore`, and switches on `page.type` to render the correct page component.
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
- **Ionic Angular** for UI components and routing strategy, only use standalone ionic components
- **Transloco** for i18n (default language: `de`); translation keys use `@domain.key` format
- **SSR** is configured but Ionic hydration is intentionally disabled — see "Ionic version & hydration status" below
- Test runner: **Vitest** (jsdom environment, `globals: true`)

### Ionic version & hydration status

_Last verified: 2026-07-20 — Angular 21.2.9, `@ionic/angular` + `@ionic/core` 8.8.8 (Stencil 4.43.0), Capacitor 8._

**Hydration is off by deliberate choice, not by defect.** `provideClientHydration` stays commented
out in every app's `app.config.ts`. Ionic's Angular integration does not support Angular client
hydration: the NG0500 node-mismatch reports ([ionic#29179](https://github.com/ionic-team/ionic-framework/issues/29179),
[ionic#30490](https://github.com/ionic-team/ionic-framework/issues/30490)) were closed as _not
planned_ and punted upstream, Angular's enabling issue
([angular#52275](https://github.com/angular/angular/issues/52275)) has been open since Oct 2023, and
`ion-router-outlet` relocates DOM nodes in a way that is structurally incompatible with
non-destructive hydration ([ionic#28534](https://github.com/ionic-team/ionic-framework/issues/28534)).
Stencil 4 does emit declarative shadow DOM, but its SSR integrations target React/Vue/Vite/Next/Nuxt —
Angular is not a supported output.

**This costs us essentially nothing.** Public, crawlable content lives in the separate static sites
(`apps/*-website`, served at `/web`); the app itself is behind Firebase Auth. Hydration would buy a
faster first paint on a login screen. Do not treat this as technical debt, and do not propose
replacing Ionic over it — Angular Material and Tailwind are a component kit and a styling system,
neither replaces the Capacitor-integrated native shell (stack navigation, platform-adaptive
transitions, gestures, the overlay/controller system) that is the actual reason Ionic is here.

**The risk worth watching is version-support lag.** Ionic's support matrix caps v8 at Angular
16–20.x; we run 21.2.9, i.e. an officially untested combination. It works today, but an Angular 22
upgrade could stall on Ionic. [ionic#30907](https://github.com/ionic-team/ionic-framework/issues/30907)
("feat: Angular21 Support", opened 2026-01-07) is the signal to track — sustained silence there, not
the hydration gap, is what would justify reopening the UI-framework question.

### i18n

All i18n work — translation keys, store wiring, passing labels to forms/ui, new-lib `de.json`, tenant overrides, build sync — is documented in the **`i18n` skill**. Core rule: i18n is **store-driven** (keys in `util`, resolved to `Signal<string>` via `I18nService.translateAll`, flowed down as `[i18n]` inputs); never use `TranslatePipe`/`AsyncPipe` for static keys (only for data-driven/runtime keys).

#### Schreibstil von i18n-Labels

Alle benutzersichtbaren Strings — Labels, Hinweise, Fehlermeldungen, Bestätigungen — folgen
demselben Ton:

- **freundlich und sachlich** — zugewandt, aber ohne Werbesprache und ohne Ausrufezeichen.
- **per du**, und **`du`/`dir`/`dein` klein geschrieben** (also „Mit diesem Link abonnierst du…",
  nicht „…abonnieren Sie…" und nicht „…abonnierst Du…").
- **allgemein verständlich, nicht technisch** — der Leser ist ein Vereinsmitglied, keine
  Entwicklerin. Kein Jargon (`Token`, `Endpoint`, `Query`), keine Feldnamen, keine Abkürzungen,
  die nicht auf der Oberfläche vorkommen. Was etwas *bewirkt*, ist wichtiger als wie es heisst.

Gilt für alle fünf Sprachen: Sprachen mit T/V-Unterscheidung nehmen die informelle Form
(fr `tu`, es `tú`, it `tu`); Englisch kennt keine und bleibt unverändert.

### Naming conventions

#### Component names

- Name the files like this: FEATURE[-purpose][.type].ts. Purpose may be edit/list/new/label etc. type may be e.g. pipe/model/validations/util/service/form/modal/store.
- Use the same structure in CamelCase to name the component e.g. feature-new.modal becomes FeatureNewModal
- avoid the usage of 'Component'. e.g. use FeatureNewModal instead of FeatureNewModalComponent.
- name the template like this okr-feature[-purpose][-type], e.g. okr-feature-new-modal.

#### Classes

- always use private | protected | public for all methods and variables

### Environment configuration

Environment file (`environment.ts`) is generated by `set-env.js` from environment variables or GCP Secret Manager — never commit them. In dev, load variables with `set -a && source ./apps/<app>/.env && set +a` — the file has no `export` lines, so a bare `source` leaves them invisible to node. The `ENV` injection token provides `OkrEnvironment` across the app.

The build process is prepared for deployment with AppHosting. That's why we have the GCP Secret manager in it. But later we had to convert back to Firebase Hosting because Ionic does not support Angular client hydration (see "Ionic version & hydration status" above — this remains true as of 2026-07 and is an accepted trade-off, not a pending fix). Thats why we generate the environment.ts file for both development and production environment. The GCP secrets are currently only used by the cloud functions.

All security sensitive configuration must be read from the environment. There is a file set-env.js, that writes the development or production environment file per app. Both set-env.js and environment.ts must not be git-committed. They are git-ignored. It is strictly forbidden to generate a config file with security sensitive information (e.g. API-keys, access tokens) into a file and to git-commit this.

Saving function secrets and all other deployment steps are documented in the **`firebase-deploy` skill**.

### Cloud Functions

Located in `apps/functions/src/`. Organized into sub-modules: `auth`, `matrix`, `matrix-simple`, `oidc-bridge`, `replication`. Built with esbuild via `pnpm nx build functions --configuration production` and deployed with `pnpm run deploy:functions` (see the **`firebase-deploy` skill**).

**When adding, removing, or changing a Cloud Function** (new integration gateway, new external API, new secret, changed trigger), update the architecture overview to match: both `planning/reference/architecture-overview.md` (inventory tables + Mermaid diagram) and its rendered twin `planning/reference/architecture-overview.html`.

### Security

- CORS rules (Content security policies CSP) are configured in firebase.json in the project root.

### Build

- all libaries are buildable
- all build artefacts reside in dist/\*
- never generate build artefacts such as _.d.ts, _.js or \*.js.map into the apps or libs tree. Keep the source code in apps and libs tree clean.

### Deployment

See the **`firebase-deploy` skill** for all deployment commands and guidelines (hosting/app, functions, rules, secrets, bundle-size and no-SSR/no-App-Hosting constraints).

### QA

- use test runner vite for unit tests
- create unit tests for each util function (shared-util and feature/util)

### Patterns

- for date conversions in Cloud Functions and libs, always use `convertDateFormatToString` / `convertDateFormat` / `DateFormat` from `@okr/shared-util-core`. Never write custom date helpers (e.g. no `toStoreDate` in bexio/shared.ts or similar).
- use Angular Signal Forms (`@angular/forms/signals`) for all forms. Build the form in the `*.form.ts` (ui component) with `form(this.formData, (path) => validateVestTree(path, <suite>))`, binding controls via `[control]`. Keep validation logic in Vest suites in the feature's `util` component and bridge them with `validateVestTree` from `@okr/shared-util-angular`. (Do NOT use `ngx-vest-forms` / `scVestForm` / `validationConfig` — that dependency was removed in the 2026-06 Signal Forms migration.)
- do only create form models if needed
- a feature typically consists of FEATURE-list.ts (a list view of FEATURE[]), FEATURE-edit.modal.ts (the detail view) using FEATURE.form.ts (in ui component of the feature) as well as FEATURE.store.ts (feature related store).
- for all icon work (rendering, choosing a name, icon sets), use the **`icons` skill**. Core rule: always `<ion-icon src="{{ 'name' | svgIcon }}" />`, never the `name` attribute.

### Hard Rules

- never install a new dependency without asking first
- never modify the database schema (shared-models) without asking first
- whenever you add, remove, or change a model in `shared-models` (a new collection, a renamed/added/removed `*Key` foreign key, a changed relationship or `modelType`), update the data-model reference to match: `planning/reference/DATA_MODEL.md` and its self-contained diagram `planning/reference/data-model-er.html`. These are hand-maintained snapshots — they do not auto-update.
- api calls for external integrations should use a firebase cloud function where possible. This Cloud functions stores the access token securely and caches token as well as data for later requests.
- do not try to find icon assets in the code — the icons reside in the database and are loaded via url (see the **`icons` skill**).
- **Branching (parallel-session aware):** A single, solo session commits directly to `main` — no branch. When multiple sessions run at once, each session works in its **own git worktree** on a short-lived `work/<name>` branch so sessions never collide in a shared working tree. Create one with `pnpm session:new <name>` (see `scripts/session-worktree.mjs`), integrate back with `git merge --ff-only work/<name>` once green, then `pnpm session:remove <name>`. Do **not** open long-lived feature branches or PRs for routine work — `work/*` branches are ephemeral and fast-forward onto `main`.
- When creating a new library layer or feature (data-access, feature, ui, util), always create three files: `tsconfig.json`, update `tsconfig.lib.json` with `references`, and create `package.json`. Use an existing sibling lib (e.g. `libs/folder/<layer>/`) as a template. The `tsconfig.json` lists all `@okr/*` dependencies as references; the `tsconfig.lib.json` must **also** list all of them (run `pnpm lib-refs:write` to generate — see "type-checking vs. building" above; listing only intra-domain siblings is what used to scatter build artifacts across `libs/`); the `package.json` must have `"name": "@okr/<lib-name>"` (with the `@okr/` scope) and all `@okr/*` dependencies listed. Missing or mis-named `package.json` (without `@okr/` scope) causes `TS6059 rootDir` build errors in dependent libs because Nx can't redirect imports to the compiled declaration files.
- when creating a new libray layer or feature, create a route for the list component (_.list) and for the detail component(_.page). Use existing routes as examples and ask user about guard permissions, if you are not sure.

## Working Style

When exploring the codebase, limit exploration to 3-4 file reads before producing initial output or a plan. Always communicate what you're doing if exploration takes more than a few steps.

## Debugging

When fixing bugs, verify the root cause is in the correct file/service before making changes. Ask for clarification if the error source is ambiguous rather than guessing.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
