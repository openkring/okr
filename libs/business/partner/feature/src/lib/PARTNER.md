# Partner

## Overview

The **partner registry** of the self-hosting partner channel (spec 1.25 / C3 §5). One document per
partner company, in tenant `kring`. bkaiser-side only: a partner never sees this screen — they see
their own installation, which pushes metering into it.

The record is deliberately thin. The partner's *commercial* identity (address, UID, invoices) lives
on an `OrgModel` shared into `bkg` and is referenced by `orgKey`; duplicating it here would give the
same company two spellings, and the one on the invoice would be the wrong one.

## Firestore collection

`partners/{okey}` — `PartnerModel` (`@okr/shared-models`).

**`okey` IS the `partnerKey`.** It is the join key of every `meteringRecords` and
`commissionEntries` document and the value a metering push authenticates against. Never rename it
for a live partner.

## Field semantics

| Field | Written by | Meaning |
|---|---|---|
| `name` | this form | The partner's name in the contract. |
| `orgKey` | this form | The partner's Org in `bkg` (`tenants: ['bkg','kring']`, created by `mergeOrgIntoTenant`). |
| `status` | this form | `prospect` · `active` · `suspended` · `terminated`. Only `active` may push metering or claim leads. Edited through a **select built from the `PartnerStatus` union**, not a text field — a typo'd status is a partner no code branches on. |
| `contractStart` / `contractEnd` | this form | Store dates (`DateFormat`). `contractEnd` stays empty while the contract runs. |
| `serviceUid` | this form | Firebase Auth uid of the partner's reporting identity. Pasted from the console; it is what `pushMetering` resolves a caller by. Never indexed (`getPartnerIndex`) — it is credential-like. |
| `lastHeartbeatAt` | **`pushMetering` (Cloud Function)** | Stamped on every push, *whatever the payload contained*. Read-only here by design: a form that could set it would let an operator fake the very heartbeat the termination trigger reads. |
| `reportedVersion` | **`pushMetering`** | Feeds the C2 §5 supported-version matrix. |

## Store

`PartnerStore` — component-provided by `PartnerList` (`providers: [PartnerStore]`), not
`providedIn: 'root'`. Holds the search term, an `rxResource` over `PartnerService.list()`, and
`add`/`edit`/`delete`. `delete` archives (`isArchived`) rather than removing: a terminated partner's
commission history has to stay readable.

## Components

| Component | Role |
|---|---|
| `PartnerList` (`partner-list.ts`) | The registry screen. Name · status · **heartbeat** columns, search filter, `add` via the `partner-context` menu, per-row ActionSheet. The heartbeat cell colours at C2 §13.3's marks — `warning` at 3 days (notice due), `danger` at 14 (termination right) — via `heartbeatStatus` from `@okr/business-metering-util`, the same function the daily `checkPartnerHeartbeats` job uses. |
| `PartnerEditModal` (`partner-edit.modal.ts`) | Detail view. No submit button — `okr-change-confirmation` appears when the form is valid **and** dirty. Resolves i18n through `I18nService` directly and never injects `PartnerStore`, so no `providers` array and no import cycle. |
| `PartnerForm` (`@okr/business-partner-ui`) | Signal Forms + Vest (`partnerValidations`). |

## Route

`/partner/:listId/:contextMenuName` in `kring-app`, behind `isAdminGuard` — the registry carries a
partner's credentials-adjacent `serviceUid` and their contractual status.

## Library path

`libs/business/partner/feature` → `@okr/business-partner-feature`
