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
| `event` | category `workflow_event` — see the event catalogue below |
| `probe` | category `workflow_probe`. `''`/`always` = unconditional. A comma-separated list is **ANDed**, and an item may carry an inline `:arg` (`categoryIs:passive,hasActiveOwnerships`). An **unknown** probe fails closed |
| `probeArg` | single argument for a one-probe rule, e.g. `key`, `locker`, `passive` |
| `responsibilityKey` | `ResponsibilityModel.okey` → who gets the task. One per rule: it applies to every step |
| `steps[]` | the consequences, **in execution order**. Never empty — the editor keeps the last step and offers deleting the rule instead |
| `steps[].action` | `openTask` \| `sendEmail` \| `sendMessage` \| `esign` \| `requestApproval` \| `openChat`. A task already produces a push (`onTaskWritten`) |
| `steps[].actionArg` | the ONE variable string per action: email template · esign storage path · approval kind · chat group key |
| `steps[].messageKey` | i18n key resolved **server-side** from `i18nTenantOverride` → `i18nDefault`; `{name}` is replaced with the member's name (single braces — `{{…}}` would be eaten by Transloco) |
| `steps[].dueInDays` | `openTask` only; `0` = no due date |
| `steps[].writeBack` | `requestApproval` only; `'collection.field'`, `''` = none |
| `order` | evaluation order, readability only |

## Event catalogue

| Event | Emitted from | `relatedKey` | notable params |
|---|---|---|---|
| `membership.created` · `.ended` · `.categoryChanged` | the `memberships/{id}` trigger (`auth/account-sync.ts`) | `membership.<okey>` | `category`, `categoryAbbr`, `fromCategory` |
| `expense.created` | inside the `createExpense` callable | `expense.<okey>` | `amount`, `currency`, `category` |
| `form.submitted` | inside the `submitForm` callable | `formSubmission.<okey>` | `formKey`, `formName` |
| `application.created` | `onDocumentCreated('applications/{id}')` | `application.<okey>` | `state`, `kind` |
| `reservation.created` | `onDocumentCreated('reservations/{id}')` | `reservation.<okey>` | `resourceKey`, `resourceType`, `startDate` |
| `task.completed` | `onDocumentUpdated('tasks/{id}')` | `task.<okey>` | `taskName`, `authorName`, `assigneeName` |
| `approval.decided` | the approval trigger | the **subject's** key | `decision`, `approvalKey`, `approverName` |
| `trip.damageReported` (Schadenmeldung) | inside the `reportIncident` callable | `report.<uuid>` | `boatName`, `personName`, `tripName`, `message`, `notes`, `linkKey` |
| `trip.bugReported` (Fehlermeldung) | inside the `reportIncident` callable | `report.<uuid>` | `boatName`, `personName`, `tripName`, `message`, `notes`, `linkKey` |

The two `trip.*` events are the one case with **no document to trigger on** — a report is not
persisted, it *is* the event. `reportIncident` therefore derives the event name from a closed
`kind` map rather than accepting one, so a signed-in client cannot fire arbitrary events.

Their `relatedKey` is unique per report on purpose: `openTask` deduplicates on
(`relatedKey`, assignee) and `sendMessage` derives its Matrix txnId from it, so a stable key
would make the second report of the day vanish silently. Distinct incidents, distinct keys.

**`params.linkKey`** is the escape hatch that unique keys create: a `report.<uuid>` points at no
document, so the task would have nothing to link back to. The emitter puts the real subject
(`trip.<okey>`) there, `openTask` writes it to the task's `linkKey`/`linkModelType`, and the task
UI links to it while `relatedKey` keeps doing dedup. Empty `linkKey` falls back to `relatedKey`.

**`params.notes`** is the generic free-text channel into `openTask`: the rule's `messageKey`
names every task of a rule identically, so anything the user actually typed (a damage
description) only survives because the emitter puts it there. Seed the two SCS rules with
`node scripts/seed-trip-report-workflow.mjs --dry` first.

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
  change-confirmation + one Signal Forms form. The form is in two parts: the **trigger** card
  (name, event, probe, responsibility — one per rule) and the **action steps** below it, one
  collapsible card each, reorderable by drag (`ion-reorder-group`; array order IS execution
  order). A step whose mandatory fields are missing carries a red marker while collapsed, so a
  three-step rule does not just go quietly invalid. The pure step operations
  (`addWorkflowStep`, `removeWorkflowStep`, `setWorkflowStepAction`, `patchWorkflowStep`,
  `isWorkflowStepComplete`) live in the `util` lib and are unit-tested there.
- The list is grouped by **event**, because a rule's old one-line summary was its trigger — which
  stopped describing it once a rule could carry several actions. Each row shows its actions as
  numbered pills in execution order, plus the same red marker for an incomplete rule.

## Library path

`libs/system/workflow/{data-access,feature,ui,util}` → `@okr/system-workflow-*`.
