// apps/functions/src/workflow/engine.ts
//
// Workflow trigger rules — the engine
// (planning/specs/2026-08-12-workflow-trigger-rules-design.md).
//
// A domain event ("membership ended") is matched against tenant-scoped rules in
// `workflow-rules`; each matching rule runs its probe, resolves who is responsible and
// opens a task for them. This replaces the hard-coded task blocks that used to live in
// MembershipStore — and because it runs in a Firestore trigger, imports, bexio sync and
// Cloud Function writes now produce the same consequences as the UI.
//
// Everything here is expressed over the WorkflowDeps seam (see types.ts), so the whole
// engine is unit-testable without an emulator. The Firestore implementation is in
// firestore-deps.ts.

import { OwnershipDoc, ResponsibilityDoc, WorkflowContext, WorkflowDeps, WorkflowRuleDoc } from './types';

/** Invoice states that count as open. `draft`, `paid` and `cancelled` do not. */
export const OPEN_INVOICE_STATES = ['pending', 'overdue'];

type Probe = (ctx: WorkflowContext, arg: string, deps: WorkflowDeps) => Promise<boolean>;

const isActiveOwnership = (o: OwnershipDoc): boolean => !o.isArchived && o.state === 'active';

/**
 * Named condition probes. A new condition costs a deploy — deliberately cheaper than a
 * parser, an evaluator, sandboxing and the error-reporting UI an expression language
 * would need.
 */
export const PROBES: Record<string, Probe> = {
  /** the person still owns/rents something */
  hasActiveOwnerships: async (ctx, _arg, deps) =>
    (await deps.ownerships(ctx.personKey, ctx.tenantId)).some(isActiveOwnership),

  /** …and of a specific resource type, e.g. 'key' | 'locker' */
  hasOwnershipOfType: async (ctx, arg, deps) =>
    (await deps.ownerships(ctx.personKey, ctx.tenantId))
      .some((o) => isActiveOwnership(o) && o.resourceType === arg),

  /** the event's subject is now in this category, e.g. 'passive' — the one probe that
   *  reads the event rather than the database */
  categoryIs: async (ctx, arg) => ctx.subjectCategory === arg,

  /** the person has at least one invoice in an open state (the state is authoritative,
   *  paymentDate is not consulted) */
  hasOpenInvoices: async (ctx, _arg, deps) =>
    (await deps.invoices(ctx.personKey, ctx.tenantId))
      .some((i) => !i.isArchived && OPEN_INVOICE_STATES.includes(i.state ?? '')),
};

/**
 * Run one rule's probe. An empty probe always fires; an UNKNOWN probe fails closed —
 * a notification that silently stops is better than one that fires on every member.
 */
export async function runProbe(rule: WorkflowRuleDoc, ctx: WorkflowContext, deps: WorkflowDeps): Promise<boolean> {
  // A comma-separated list is ANDed, and an item may carry its own ':arg' — that is the
  // whole "syntax". It exists because the migrated passive-switch rules genuinely need
  // two conditions ('categoryIs:passive' AND 'hasActiveOwnerships'); anything richer
  // (OR, negation, grouping) is a new named probe, not a longer string.
  const names = (rule.probe ?? '').split(',').map((n) => n.trim()).filter((n) => n.length > 0);
  for (const entry of names) {
    const [name, inlineArg] = entry.split(':');
    // 'always' is the category item standing in for the model's empty default
    if (name === 'always') continue;
    const probe = PROBES[name];
    if (!probe) {
      await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: `unknown probe '${name}'` });
      return false;
    }
    if (!(await probe(ctx, inlineArg ?? rule.probeArg ?? '', deps))) return false;
  }
  return true;   // no probe at all = always fires
}

/**
 * True when `today` (StoreDate) lies inside the responsibility's own validity window.
 * The live documents populate these (`validFrom: '20190627'`, `validTo: '99991231'`), so a
 * role someone has handed over must not keep receiving tasks. An empty bound is open.
 */
export function isResponsibilityValid(r: ResponsibilityDoc, today: string): boolean {
  const from = r.validFrom ?? '';
  const to = r.validTo ?? '';
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

/** True when `today` (StoreDate) lies inside the delegate's validity window. */
export function isDelegateActive(r: ResponsibilityDoc, today: string): boolean {
  if (!r.delegateAvatar?.key) return false;
  const from = r.delegateValidFrom ?? '';
  const to = r.delegateValidTo ?? '';
  if (from && today < from) return false;
  if (to && today > to) return false;
  return Boolean(from || to); // no window at all = no delegation
}

/**
 * responsibilityKey → the person who gets the task.
 *
 * responsible → delegate (inside its window) → the role's group admin (today's
 * behaviour) → the tenant admin. Each fallback logs an activity, so a misconfigured
 * rule is visible rather than silent.
 */
export async function resolveAssignee(
  rule: WorkflowRuleDoc,
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<ResponsibilityDoc['responsibleAvatar'] | undefined> {
  const key = rule.responsibilityKey ?? '';
  const responsibility = key ? await deps.responsibility(key, ctx.tenantId) : undefined;

  if (responsibility && !responsibility.isArchived && isResponsibilityValid(responsibility, ctx.today)) {
    if (isDelegateActive(responsibility, ctx.today)) return responsibility.delegateAvatar;
    if (responsibility.responsibleAvatar?.key) return responsibility.responsibleAvatar;
  }

  await deps.logActivity(ctx.tenantId, {
    rule: rule.okey, event: ctx.event, fallback: 'group', responsibilityKey: key,
  });
  const groupAdmin = key ? await deps.groupAdmin(key, ctx.tenantId) : undefined;
  if (groupAdmin?.key) return groupAdmin;

  await deps.logActivity(ctx.tenantId, {
    rule: rule.okey, event: ctx.event, fallback: 'tenantAdmin', responsibilityKey: key,
  });
  return deps.tenantAdmin(ctx.tenantId);
}

/**
 * Execute a rule that has already passed its probe. v1 knows exactly one action.
 *
 * Deduplication: an open task with the same relatedKey AND the same assignee means this
 * consequence is already pending — without it every re-trigger (a corrected exit date, a
 * sweep re-run, a name change re-writing the document) would produce another task.
 */
export async function runAction(rule: WorkflowRuleDoc, ctx: WorkflowContext, deps: WorkflowDeps): Promise<void> {
  if ((rule.action ?? 'openTask') !== 'openTask') {
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: `unknown action '${rule.action}'` });
    return;
  }

  const assignee = await resolveAssignee(rule, ctx, deps);
  if (!assignee?.key) {
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'no assignee resolved' });
    return;
  }

  if (await deps.hasOpenTask(ctx.relatedKey, assignee.key, ctx.tenantId)) {
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, skipped: 'duplicate', relatedKey: ctx.relatedKey });
    return;
  }

  const name = await deps.translate(ctx.tenantId, rule.messageKey ?? '', {
    name: ctx.subjectName,
    category: ctx.categoryAbbr,
    fromCategory: ctx.previousAbbr,
  });
  await deps.createTask({
    tenantId: ctx.tenantId,
    name,
    assignee,
    dueInDays: rule.dueInDays ?? 0,
    relatedModelType: ctx.relatedKey.split('.')[0] ?? '',
    relatedKey: ctx.relatedKey,
  });
}

/**
 * Evaluate every rule of the tenant for this event.
 *
 * Errors are caught per rule: one broken rule must never abort the others, and never
 * the membership write that produced the event.
 */
export async function runWorkflowWith(ctx: WorkflowContext, deps: WorkflowDeps): Promise<void> {
  const rules = await deps.rules(ctx.tenantId, ctx.event);
  for (const rule of [...rules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    try {
      if (!(await runProbe(rule, ctx, deps))) continue;
      await runAction(rule, ctx, deps);
    } catch (error) {
      await deps.logActivity(ctx.tenantId, {
        rule: rule.okey, event: ctx.event, error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
