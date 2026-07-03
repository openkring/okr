# openkring

The open-source core of the **Kring** platform — a multi-tenant club / association
management app built with Angular, Ionic, and Firebase, organised as an
[Nx](https://nx.dev) monorepo.

## Repository topology

This public repository (`openkring/okr`) contains the reusable **core**: the feature
libraries (`libs/**`), Cloud Functions (`apps/functions`), Firestore/Storage rules,
and public documentation (`docs/**`).

The tenant applications, planning documents, and internal skills live in **private
submodules** under the `bkaiser-org` organisation and are only populated for members:

| Path | Submodule | Visibility |
| --- | --- | --- |
| `apps/scs-app` | `bkaiser-org/scs-app` | private |
| `apps/scs-website` | `bkaiser-org/scs-website` | private |
| `apps/p13-website` | `bkaiser-org/p13-website` | private |
| `apps/kring-website` | `bkaiser-org/kring-website` | private |
| `apps/okr-website` | `bkaiser-org/okr-website` | private |
| `planning/` | `bkaiser-org/okr-planning` | private |
| `.claude/skills` | `bkaiser-org/okr-skills` | private |

Public contributors get a fully buildable core (libs + functions + rules); the
submodule directories are empty pointers unless you have access.

## Getting started

**Members** (access to the private submodules):

```sh
git clone --recurse-submodules git@github.com:openkring/okr.git
cd okr
nvm use 22.22.1
pnpm install
```

**Public contributors** (core only):

```sh
git clone git@github.com:openkring/okr.git   # submodule dirs stay empty
cd okr && pnpm install
```

### Environment

Each app reads its secrets from a git-ignored `.env`; `set-env.js` writes
`environment.ts` from it. Copy the template and fill in real values:

```sh
cp apps/scs-app/.env.example apps/scs-app/.env   # then edit
source ./apps/scs-app/.env && ts-node ./set-env.js
```

Never commit `.env`, `environment.ts`, or `set-env.js` — they are git-ignored.

## Common tasks

```sh
pnpm nx serve scs-app                                   # dev server
pnpm nx build scs-app --configuration production        # production bundle
pnpm nx build functions --configuration production      # Cloud Functions
pnpm run deploy:functions                               # deploy functions
pnpm run testlibs                                       # run all library unit tests
pnpm run lint                                           # lint
pnpm nx graph                                           # dependency graph
```

See `pnpm nx show project <name>` for a project's available targets.

## Architecture

- **Frontend:** Angular 20 (zoneless, standalone, signals), Ionic 8, Capacitor 7, SCSS
- **Backend:** Firebase — Firestore, Auth, Storage, FCM, App Check; Cloud Functions (Node/esbuild)
- **State:** NgRx Signal Stores
- **i18n:** Transloco (default `de`), store-driven
- **Libraries:** each domain split into `data-access` / `feature` / `ui` / `util`,
  imported via the `@okr/<domain>-<layer>` path alias.

## License

MIT
