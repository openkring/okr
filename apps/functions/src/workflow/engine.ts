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

import { AvatarInfo } from '@okr/shared-models';

import { OwnershipDoc, ResponsibilityDoc, WorkflowActionStepDoc, WorkflowContext, WorkflowDeps, WorkflowRuleDoc } from './types';

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

  /** the event's subject is now in this membership category, e.g. 'passive' — one of the
   *  probes that read the event rather than the database.
   *  NB `params.category` is the ABBREVIATION used in message text; the raw category the
   *  probe compares lives in `params.membershipCategory`. */
  categoryIs: async (ctx, arg) => (ctx.params['membershipCategory'] ?? '') === arg,

  /** the decision an 'approval.decided' event carries: 'approved' | 'rejected' */
  decisionIs: async (ctx, arg) => (ctx.params['decision'] ?? '') === arg,

  /** compare ONE event parameter, written 'name=value' — the generic form of `categoryIs`
   *  and `decisionIs`, and the piece that makes one shared event usable by many rules: the
   *  event stays a picker, the discriminator goes in the argument
   *  ('paramIs:formKey=abc123', 'paramIs:resourceType=boathouse', 'paramIs:state=accepted').
   *
   *  An unknown param compares as '', so 'name=' deliberately means "absent or empty". A
   *  malformed argument with no '=' fails closed, exactly like an unknown probe — a rule
   *  nobody can read must not fire on everybody.
   *
   *  NB `runProbe` splits every comma entry on ':', so an INLINE value cannot contain a
   *  colon; put such a value in the rule's probeArg field, which is passed through untouched. */
  paramIs: async (ctx, arg) => {
    const i = arg.indexOf('=');
    if (i < 0) return false;
    return (ctx.params[arg.slice(0, i).trim()] ?? '') === arg.slice(i + 1).trim();
  },

  /** the person has at least one invoice in an open state (the state is authoritative,
   *  paymentDate is not consulted) */
  hasOpenInvoices: async (ctx, _arg, deps) =>
    (await deps.invoices(ctx.personKey, ctx.tenantId))
      .some((i) => !i.isArchived && OPEN_INVOICE_STATES.includes(i.state ?? '')),

  /** somebody else finished the task — don't notify the author about their own work.
   *  An empty author fails closed: there is nobody to address. */
  authorIsNotAssignee: async (ctx) => {
    const author = ctx.params['authorKey'] ?? '';
    return author !== '' && author !== (ctx.params['assigneeKey'] ?? '');
  },
};

/**
 * Reserved `responsibilityKey`: address the person the event is ABOUT rather than a role.
 * Used by 'task.completed' to reach the task's author.
 *
 * This does not breach the no-free-text-recipient invariant below: the recipient is still
 * derived from the event document, never typed into the rule by an admin.
 */
export const SUBJECT_RECIPIENT = 'subject';

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
  if (key === SUBJECT_RECIPIENT) {
    const subject = await deps.avatarFor(ctx.personKey, ctx.tenantId);
    if (subject?.key) return subject;
    // No role to fall back on — a message meant for the subject must not land on an admin.
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'no subject avatar', person: ctx.personKey });
    return undefined;
  }
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

/** Every action the engine understands. An unknown one fails closed and is logged. */
export const KNOWN_ACTIONS = ['openTask', 'sendEmail', 'sendMessage', 'esign', 'requestApproval', 'openChat'];

/**
 * Four eyes: nobody approves their own request.
 *
 * When the resolved responsible person IS the requester, escalate one step — group admin,
 * then tenant admin. If that still lands on the same person the approval is created with
 * NO approver and shows up in the admin's "unassigned" filter. It is never auto-approved:
 * a request that cannot find a second pair of eyes must stall visibly, not pass silently.
 */
export async function escalateForFourEyes(
  rule: WorkflowRuleDoc,
  ctx: WorkflowContext,
  deps: WorkflowDeps,
  assignee: AvatarInfo,
  requesterKey: string,
): Promise<AvatarInfo | undefined> {
  if (!requesterKey || assignee.key !== requesterKey) return assignee;

  await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, fourEyes: 'requester is the approver', person: requesterKey });

  const groupAdmin = rule.responsibilityKey ? await deps.groupAdmin(rule.responsibilityKey, ctx.tenantId) : undefined;
  if (groupAdmin?.key && groupAdmin.key !== requesterKey) return groupAdmin;

  const tenantAdmin = await deps.tenantAdmin(ctx.tenantId);
  if (tenantAdmin?.key && tenantAdmin.key !== requesterKey) return tenantAdmin;

  await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, fourEyes: 'unassigned — no second pair of eyes' });
  return undefined;
}

/**
 * A rule's message, with `{name}` and every event param filled in. Composing the text
 * here rather than in the deps keeps the I/O layer free of i18n and makes every action's
 * wording testable without Firestore.
 */
async function message(step: WorkflowActionStepDoc, ctx: WorkflowContext, deps: WorkflowDeps, suffix = ''): Promise<string> {
  const key = step.messageKey ?? '';
  if (!key) return '';
  return deps.translate(ctx.tenantId, key + suffix, { name: ctx.subjectName, ...ctx.params });
}

/**
 * `sendEmail` / `sendMessage` fire once per event, and an import fires the event once per
 * record. The cap is per (tenant, rule, day) and is counted from the activity log the
 * actions themselves write.
 */
export const MAX_RULE_SENDS_PER_DAY = 200;

async function overSendCap(rule: WorkflowRuleDoc, ctx: WorkflowContext, deps: WorkflowDeps): Promise<boolean> {
  const sent = await deps.sendCount(ctx.tenantId, rule.okey, ctx.today);
  if (sent < MAX_RULE_SENDS_PER_DAY) return false;
  await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, skipped: 'daily send cap', sent });
  return true;
}

/**
 * Execute every step of a rule that has already passed its probe.
 *
 * Steps run in order and independently: a failing one is logged and the next still runs, the
 * same contract `runWorkflowWith` gives whole rules. `assigneeOnce` memoises `resolveAssignee`
 * across the steps of one rule, so a rule with several steps resolves the responsible person
 * (and logs its fallback chain) exactly once — every PERSON-addressed action needs that
 * assignee. `openChat` addresses a GROUP instead and resolves it before this call, so a rule
 * whose responsibility is unfilled or misconfigured can still open the conversation.
 */
export async function runAction(rule: WorkflowRuleDoc, ctx: WorkflowContext, deps: WorkflowDeps): Promise<void> {
  const steps = rule.steps ?? [];
  if (!steps.length) {
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'rule has no steps' });
    return;
  }

  let resolved: AvatarInfo | undefined;
  let didResolve = false;
  const assigneeOnce = async (): Promise<AvatarInfo | undefined> => {
    // flip the flag before the await: a throwing resolveAssignee must still count as "tried",
    // so it is not retried (and re-logged) for every remaining step — the same one-shot
    // behaviour the old per-rule resolution had.
    if (didResolve) return resolved;
    didResolve = true;
    resolved = await resolveAssignee(rule, ctx, deps);
    return resolved;
  };

  for (const [index, step] of steps.entries()) {
    try {
      await runStep(rule, step, index, ctx, deps, assigneeOnce);
    } catch (error) {
      await deps.logActivity(ctx.tenantId, {
        rule: rule.okey, event: ctx.event, action: step.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Execute a single step. Most actions address the SAME resolved responsible person — a rule
 * can never name a free-text recipient, which is what keeps it from being a spam gun any
 * tenant admin can point anywhere (spec 2026-08-15 §2.2). `openChat` is the one exception: it
 * addresses a GROUP and is dispatched before the assignee is resolved, so it still runs when
 * the responsibility is vacant or misconfigured.
 *
 * Deduplication of `openTask`: an open task with the same relatedKey AND the same assignee
 * means this consequence is already pending — without it every re-trigger (a corrected exit
 * date, a sweep re-run, a name change re-writing the document) would produce another task.
 * This key does NOT include the step index (it is stored on the task document and read by
 * other code paths, so it cannot grow one now): two `openTask` steps of the same rule
 * addressing the same assignee dedup against EACH OTHER, not just against re-triggers. A rule
 * that genuinely needs two tasks for the same event has to be configured as two rules.
 */
export async function runStep(
  rule: WorkflowRuleDoc,
  step: WorkflowActionStepDoc,
  stepIndex: number,
  ctx: WorkflowContext,
  deps: WorkflowDeps,
  assigneeOnce: () => Promise<AvatarInfo | undefined>,
): Promise<void> {
  const action = step.action || 'openTask';
  if (!KNOWN_ACTIONS.includes(action)) {
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: `unknown action '${action}'` });
    return;
  }

  // openChat addresses a GROUP, so it neither needs nor waits for a resolved assignee — a rule
  // whose responsibility is unfilled must still be able to open the conversation.
  if (action === 'openChat') {
    if (await overSendCap(rule, ctx, deps)) return;
    const groupId = (step.actionArg ?? '').trim();
    if (!groupId) {
      await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'openChat needs a group key in actionArg' });
      return;
    }
    if (!ctx.personKey) {
      await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'openChat has no subject person' });
      return;
    }
    // the rule's own wording wins; without one the reporter's text IS the opening message
    const body = (await message(step, ctx, deps)) || ctx.params['notes'] || '';
    if (!body) {
      await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'openChat has no message' });
      return;
    }
    await deps.openChatRoom({
      tenantId: ctx.tenantId,
      ruleKey: rule.okey,
      groupId,
      personKey: ctx.personKey,
      body,
      // deterministic per (rule, step, event, subject): a retried invocation reuses the
      // transaction id, so Synapse drops the copy. The step index keeps two openChat steps
      // of the same rule from colliding with EACH OTHER, the same reason sendMessage carries
      // it (see the txnId comment below).
      txnId: `wf-${rule.okey}-${stepIndex}-${ctx.event}-${ctx.relatedKey}`.replaceAll(/[^\w-]/g, '_'),
    });
    return;
  }

  const assignee = await assigneeOnce();
  if (!assignee?.key) {
    await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'no assignee resolved' });
    return;
  }

  switch (action) {
    case 'openTask': {
      if (await deps.hasOpenTask(ctx.relatedKey, assignee.key, ctx.tenantId)) {
        await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, skipped: 'duplicate', relatedKey: ctx.relatedKey });
        return;
      }
      await deps.createTask({
        tenantId: ctx.tenantId,
        name: await message(step, ctx, deps),
        assignee,
        dueInDays: step.dueInDays ?? 0,
        relatedModelType: ctx.relatedKey.split('.')[0] ?? '',
        relatedKey: ctx.relatedKey,
        linkKey: ctx.params['linkKey'] ?? '',
        notes: ctx.params['notes'] ?? '',
      });
      return;
    }

    case 'sendEmail': {
      if (await overSendCap(rule, ctx, deps)) return;
      const to = await deps.emailFor(assignee.key, ctx.tenantId);
      if (!to) {
        await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'no email address', person: assignee.key });
        return;
      }
      await deps.sendEmail({
        tenantId: ctx.tenantId,
        ruleKey: rule.okey,
        to,
        subject: await message(step, ctx, deps),
        body: await message(step, ctx, deps, '.body'),
        template: step.actionArg ?? '',
      });
      return;
    }

    case 'sendMessage': {
      if (await overSendCap(rule, ctx, deps)) return;
      const matrixUserId = await deps.matrixIdFor(assignee.key);
      if (!matrixUserId) {
        await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'no matrix account', person: assignee.key });
        return;
      }
      await deps.sendChatMessage({
        tenantId: ctx.tenantId,
        ruleKey: rule.okey,
        matrixUserId,
        body: await message(step, ctx, deps),
        // deterministic: a retried invocation reuses the transaction id, so Synapse drops
        // the second copy. The step index keeps two sendMessage steps of the same rule from
        // colliding with EACH OTHER (they would otherwise share one txnId and Synapse would
        // silently drop the second). A genuinely re-fired event days later is NOT covered —
        // see the ponytail note in the spec.
        txnId: `wf-${rule.okey}-${stepIndex}-${ctx.event}-${ctx.relatedKey}`.replaceAll(/[^\w-]/g, '_'),
      });
      return;
    }

    case 'esign': {
      const storagePath = (step.actionArg ?? '').replaceAll('{relatedKey}', ctx.relatedKey);
      if (!storagePath) {
        await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, error: 'esign needs a storage path in actionArg' });
        return;
      }
      await deps.startEsign({
        tenantId: ctx.tenantId,
        ruleKey: rule.okey,
        storagePath,
        signee: assignee,
        documentName: await message(step, ctx, deps),
        relatedKey: ctx.relatedKey,
      });
      return;
    }

    case 'requestApproval': {
      const kind = step.actionArg ?? '';
      if (await deps.hasPendingApproval(ctx.relatedKey, kind, ctx.tenantId)) {
        await deps.logActivity(ctx.tenantId, { rule: rule.okey, event: ctx.event, skipped: 'approval pending', relatedKey: ctx.relatedKey });
        return;
      }
      const requestedBy = await deps.avatarFor(ctx.personKey, ctx.tenantId);
      const approver = await escalateForFourEyes(rule, ctx, deps, assignee, requestedBy?.key ?? '');
      await deps.createApproval({
        tenantId: ctx.tenantId,
        kind,
        subjectModelType: ctx.relatedKey.split('.')[0] ?? '',
        subjectKey: ctx.relatedKey,
        subjectName: ctx.subjectName,
        requestedBy,
        approver,
        ruleKey: rule.okey,
        writeBack: step.writeBack ?? '',
        taskName: await message(step, ctx, deps),
        dueInDays: step.dueInDays ?? 0,
      });
      return;
    }
  }
}

/**
 * Evaluate every rule of the tenant for this event.
 *
 * Errors are caught per rule: one broken rule must never abort the others, and never
 * the membership write that produced the event.
 */
export async function runWorkflowWith(ctx: WorkflowContext, deps: WorkflowDeps): Promise<void> {
  const rules = await deps.rules(ctx.tenantId, ctx.event);
  if (!rules.length) {
    // Without this line, a tenant whose rule was archived is indistinguishable from a tenant
    // whose emitter never fired — the failure mode the OCR migration introduces.
    await deps.logActivity(ctx.tenantId, { event: ctx.event, relatedKey: ctx.relatedKey, skipped: 'no rule' });
    return;
  }
  for (const rule of rules) {
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
