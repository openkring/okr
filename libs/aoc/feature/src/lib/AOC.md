# AOC (Admin Operations Console)

A short map of where the admin tools live after the restructuring (spec 1.101, phases 1–5).

## The hub

The AOC is one page, `AocHub`, shown for four areas. Each area has a fixed route (`isAdminGuard()`),
and the area comes from the route data (`data: { area }`). There is no `/aoc/:area` route.

| Area | Route | Menu row |
|---|---|---|
| Zugang & Datenschutz | `/aoc/access` | `aoc-access` |
| Betrieb | `/aoc/ops` | `aoc-ops` |
| Konfiguration | `/aoc/config` | `aoc-config` |
| Datenqualität | `/aoc/data` | `aoc-data` |

The `aoc-menu` submenu holds these four rows, followed by the closing `divider_empty`. Rows outside
the catalogue (`aoc-allocation`, `operator-chat`, `alias-all`, `alias-spaces`, `person-privacy`) stay
below them. Only the `aoc` block declares `aoc-menu`. The `aoc` block is `core: true`: the hub is
the only menu path to users, privacy and the feature picker, so no tenant can switch it off.

The cards are pure data: `AOC_AREAS` in `@okr/aoc-util` (`libs/aoc/util/src/lib/aoc-areas.ts`), in
display order. `visibleAocCards` filters them by tenant (`tenants`, `notOnApps`), feature block and
role. A card either opens a route or runs an operation, which `AocHubStore` dispatches. The store
writes each run to `activities` (`scope: 'aoc'`), and the card shows the last run from there.

## Cards per area

### Zugang & Datenschutz

| Card | Target | What it does |
|---|---|---|
| Benutzer & Zugänge | `/user/all/c-users` | Logins, roles and account tools (`@okr/user-feature`) |
| Sessions | `/aoc/sessions` | Who was signed in, when, and on which device (`AocSession`) |
| Bearbeitungsverzeichnis | `/security/register` | The processing register (`@okr/security-processing-feature`) |
| Privacy Audit | `/security/privacy-audit` | Checks the privacy protection (`@okr/security-audit-feature`) |
| IBAN-Bestand | operation `iban` | Lists the persons and organisations with an IBAN on file, as a report |
| Mandanten-Zuteilung | `/operator/allocation` | Operator only (bka) |

### Betrieb

| Card | Target | What it does |
|---|---|---|
| System-Aktivitäten | `/activity` | The activity log (`@okr/activity-feature`) |
| E-Mail-Ereignisse | `/aoc/email` | Delivery, open and bounce events of outgoing mail (`AocEmail`), operator only |
| Chat-Wartung (Betreiber) | `/operator/chat` | Operator only (bka) |
| Eskalationen | `/ticket/all` | The 3LS escalation queue, kring only |

### Konfiguration

| Card | Target | What it does |
|---|---|---|
| Features | `/tenant/features` | The feature picker (`@okr/tenant-feature`) |
| Workflow-Regeln | `/workflow/all/workflow-context` | Workflow rules (`@okr/system-workflow-feature`) |

### Datenqualität

| Card | Target | What it does |
|---|---|---|
| Daten-Validierung | operation `validate` | Runs the Vest suites over the collections and lists the findings as a report |
| Suchindex neu aufbauen | operation `reindex` | Previews the documents whose `index` differs, then writes only that field |

Bulk fixes have no UI. Use `node scripts/fix-models.mjs --collection <name> [--max <n>] [--apply]`
(dry run by default).

## kring

kring-app composes its routes from the catalogue like every other app (since 2026-10-26), so all
four hub areas exist there. The only kring-specific card is Eskalationen (`tenants: ['kring']`).

## Where the moved tools live

| Old tool | New home | Phase |
|---|---|---|
| Content | Seiten › Integrität prüfen, `/page/integrity` | 2 |
| Doc | Dokumente › Verwaiste Dateien, `/document/orphans` | 2 |
| Kiosk | Logbuch › Kiosk-Geräte, `/trips/kiosk` | 2 |
| Trip | Logbuch › Logbuch aufräumen, `/trips/maintenance` | 2 |
| Diary | Tagebuch › Import vorbereiten, `/diary/import` | 2 |
| SRV / Regasoft | Mitglieder › Wartung › Verbandsabgleich, `/membership/srv` | 3 |
| Bexio contacts | Personen › Wartung › Bexio-Kontakte, `/person/bexio-contacts` | 3 |
| Year-end membership reports | Mitglieder › Wartung (memberAdmin) | 3 |
| Statistik | deleted | 3 |
| Roles, User Accounts | Benutzer & Zugänge, `/user/all/c-users` | 4 |
| Chat | Chat › Wartung, `/chat/maintenance`; bka also `/operator/chat` | 4 |
| Admin Ops: IBAN list | Zugang › IBAN-Bestand | 5 |
| Admin Ops: `backfillAccountTenants` | no UI; the callable stays deployed (script use) | 5 |
| Data: validation, search index | Datenqualität cards | 5 |
| Matrix room backfill | no UI; `backfillMatrixRoomTenants` stays deployed (script use); rooms are assigned by hand in Chat-Wartung | 5 |
| Sessions, E-Mail-Ereignisse | hub cards; the pages keep `/aoc/sessions` and `/aoc/email` | 5 |
| Benutzer, Register, Privacy Audit, Aktivitäten, Eskalationen, Workflow, Features | hub cards, no longer `aoc-menu` rows | 5 |

Tags (`/aoc/tag`) and Website (`/aoc/website`) are content tools (contentAdmin) under `cms-menu`, not
hub content. There is no Storage page, no Debug Tools page and no Daten-Korrektur page any more.
Flight Tracker is a main-menu entry (block `mobility`).

## Operator only (bka)

The operator is a caller whose `users` doc has tenants exactly `['bka']` and `roles.admin` true
(`checkOperatorTenant`, `getCallerContext().isOperator`, rules `isOperator()`). Operator only are:

- Mandanten-Zuteilung (`/operator/allocation`, bka-app only; `allocateTenant`, `getAllocationEmails`)
- Chat-Wartung (Betreiber) (`/operator/chat`, bka-app only)
- E-Mail-Ereignisse (the `emailEvents` read rule)
- the callables `backfillAccountTenants` and `backfillMatrixRoomTenants` (no UI any more; called by script)
- «Adressverzeichnis neu aufbauen» on the Privacy Audit page (`rebuildAddressDirectory`; the button
  is shown only when `tenantId === OPERATOR_TENANT_ID`)
- `listFirebaseUsers` and `listBkUsers` return the whole project only to bka, the caller's own tenant otherwise

Outside bka, the account callables act only on logins whose `users` doc belongs to the caller's tenant
alone (`loadTenantUser`, `isSoleTenantUserData`, `mayDeleteAuthUser`).

## Library path

`@okr/aoc-feature` (`libs/aoc/feature/src/lib/`): `AocHub`, `AocSession`, `AocEmail`, `AocTag`,
`AocWebsite`, `AocTenantAllocation` and the tenant switcher. `@okr/aoc-util` (`libs/aoc/util/src/lib/`):
`AOC_AREAS`, `AOC_AREA_ROUTES`, the hub i18n keys and the pure helpers.
