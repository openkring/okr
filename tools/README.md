# @bk2/tools

Workspace tooling. Contains the `app` generator that scaffolds a new CMS-minimal tenant app.

## Scaffold a new tenant app

    pnpm nx g @bk2/tools:app --tenantId=acme --appName="Acme" [--force] [--dry-run]

Creates `apps/acme-app/` (bootstrap + auth + CMS page/section/menu + profile; domain
features stripped). Then generate its environment and build:

    source ./apps/acme-app/.env
    NX_TASK_TARGET_PROJECT=acme-app ts-node ./set-env.js
    pnpm nx build acme-app

The full tenant setup (Firebase Web App, AppConfig, .env, starter content) is driven by the
`provision-tenant` skill — see docs/specs/2026-06-29-tenant-provisioning-design.md.
