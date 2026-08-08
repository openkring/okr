# Metering & Commission

## Overview

The **metering ledger** of the partner channel (spec 1.25 / C3 §6–§7), bkaiser-side in tenant
`kring`. One screen with two lists of the same period:

| List | Collection | Written by |
|---|---|---|
| **Meldungen** (records) | `meteringRecords` | `pushMetering` (Cloud Function, Admin SDK) |
| **Provisionen** (entries) | `commissionEntries` | `runCommission` (Cloud Function, Admin SDK) |

They sit side by side because the audit question is always the same one: *does what was billed
follow from what was reported?* **Nothing here is editable.** Both sides are the evidence the 10 %
share is audited from, and `firestore.rules` denies client writes to both collections outright — a
ledger a human can retype is not evidence. The one mutation the screen offers is *triggering* the
run.

## The run button

`runCommission` is **admin-triggered, never scheduled** (C3 §7): a run is cheap to repeat and
expensive to have fire while a late push is still arriving. Re-running a period overwrites its own
entries, because the entry id is `{partnerKey}_{tenantId}_{period}` — the same idempotency
argument as the metering record id. After a run the view switches to the entries side, which is
what the operator wants to look at anyway.

Hysteresis is applied bkaiser-side inside that function, reading the bands actually **billed** in
the two previous months. That is why `band` is stored per line rather than recomputed here: it is
a decision about two months, not a function of this month's count.

## Period

An `ion-select` of the last 12 periods (`recentPeriods` in `@okr/business-metering-util`), current
month first — a partner may push mid-month (a retry, a correction), and a picker that could not
show the running month would make those invisible. Filtering is **client-side**: both collections
are fetched whole and filtered by the selected period. The volume is partners × their tenants ×
months, and a server-side `period` filter would buy a composite index per collection for nothing.

## Totals

`totalCommission` is the **sum of the per-tenant lines** of the period. It is never derived from a
partner-level user total: the band table is concave and stepped, so a partner total cannot be
decomposed back into tenants (C3 §2).

## Components

| Component | Role |
|---|---|
| `MeteringList` (`metering-list.ts`) | The whole screen: segment (records/entries), period select, run button, both tables. |
| `MeteringStore` (`metering.store.ts`) | Component-provided. Period + view state, three `rxResource`s (records, entries, partners — the last only to show a partner's name instead of their key), and `run()`. |

## Route

`/metering` in `kring-app` and in the `business` catalogue block, behind `isAdminGuard()`. **No
`:contextMenuName`**: the screen has exactly one action and it is a toolbar button, so a context
menu would mean a Firestore menu doc per tenant for a single entry.

## Library path

`libs/business/metering/feature` → `@okr/business-metering-feature`
