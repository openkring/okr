# Workflow trigger rules

Spec: [`2026-08-12-workflow-trigger-rules-design.md`](../../../../../../planning/specs/2026-08-12-workflow-trigger-rules-design.md)

## Overview

A domain event ("a membership ended") has consequences beyond the entity itself: tell the
treasurer, check the keys. Those consequences used to be hard-coded `if` blocks in
`MembershipStore`, duplicated between exit and passive-switch, routed through a
`TaskService` method that literally began `if (membership.orgKey !== 'scs') return;`, and
running **client-side** — so an import, a bexio sync or a Cloud Function write produced no
consequence at all.

They are now **data**: a tenant-scoped rule says *on this event, if this condition holds,
open a task for whoever is responsible*, and the rules are evaluated **server-side** by
`apps/functions/src/workflow`, on the same `memberships/{id}` trigger that owns the
account sync (spec 1.34). Every write path is covered.

**Invariants stay in code.** Opening and closing a user account is a product invariant, not
a tenant decision, and is NOT a rule — deleting a rule must never leave an ex-member with a
live account. Rules only decide who gets told.

## Firestore collection

`workflow-rules`, tenant-scoped, admin-only writes (`firestore.rules`).

| Field | Semantics |
|---|---|
| `name` | admin-facing label, e.g. `Austritt → Kassier` |
| `event` | category `workflow_event` — `membership.created` \| `membership.ended` \| `membership.categoryChanged` |
| `probe` | category `workflow_probe`. `''`/`always` = unconditional. A comma-separated list is **ANDed**, and an item may carry an inline `:arg` (`categoryIs:passive,hasActiveOwnerships`). An **unknown** probe fails closed |
| `probeArg` | single argument for a one-probe rule, e.g. `key`, `locker`, `passive` |
| `action` | `openTask` — the only v1 action. A task already produces a push (`onTaskWritten`) |
| `responsibilityKey` | `ResponsibilityModel.okey` → who gets the task |
| `messageKey` | i18n key resolved **server-side** from `i18nTenantOverride` → `i18nDefault`; `{name}` is replaced with the member's name (single braces — `{{…}}` would be eaten by Transloco) |
| `dueInDays` | `0` = no due date |
| `order` | evaluation order, readability only |

## The engine (`apps/functions/src/workflow`)

- `engine.ts` — the probe registry, responsibility resolution, `openTask` + deduplication.
  Pure over the `WorkflowDeps` seam, so `engine.spec.ts` covers it without an emulator.
- `firestore-deps.ts` — the Firestore implementation. Every query filters on ONE indexed
  equality field and narrows the rest in memory: no new composite indexes.
- `index.ts` — `runWorkflow(ctx)`; never throws, so a rule can never fail a membership write.

**Probes** (`hasActiveOwnerships`, `hasOwnershipOfType`, `hasOpenInvoices`, `categoryIs`)
are named functions, not an expression language: a new condition costs a deploy, which is
cheaper than a parser, an evaluator, sandboxing and an error-reporting UI. `hasOpenInvoices`
counts state `pending` or `overdue` only — `paymentDate` is not consulted.

**Responsibility resolution** is the one real upgrade over the old behaviour: responsible (only
inside the responsibility's own `validFrom`/`validTo`) → delegate (inside ITS window, so holiday
cover works) → `groups/<key>.admins[0]` (what the code did before, one person by array position)
→ the tenant admin. Each fallback writes an activity, so a misconfigured rule is visible rather
than silent. The `scs` seed rules point at the real documents `scs-treasurer` (Ressort Finanzen)
and `quts1rewzl1ubx71tqu0` (Schlüsselverwaltung); the group fallback is a safety net, not the
normal path.

**Deduplication:** an open, non-archived task with the same `relatedKey` **and** the same
assignee means the consequence is already pending. Without it a corrected exit date, a sweep
re-run or a name change would each produce another task.

## Store & components

- `WorkflowRuleStore` — list, filter, add/edit/delete. Component-provided by `WorkflowRuleList`.
- `WorkflowRuleList` — the admin screen, route `/workflow/:listId/:contextMenuName`
  (`isAdminGuard`), contributed by the `aoc` block; menu row `workflow-all` under the AOC submenu.
- `WorkflowRuleEditModal` + `WorkflowRuleForm` — in the `ui` lib, standard header +
  change-confirmation + one Signal Forms form.

## Library path

`libs/system/workflow/{data-access,feature,ui,util}` → `@okr/system-workflow-*`.
