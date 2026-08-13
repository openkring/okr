// apps/functions/src/workflow/index.ts
//
// Workflow trigger rules — entry point
// (planning/specs/2026-08-12-workflow-trigger-rules-design.md).
//
// The engine is NOT a trigger of its own: events are emitted from the function that
// already computed them (auth/account-sync.ts owns the memberships/{id} trigger, so
// "ended" is defined exactly once).

import { logger } from 'firebase-functions/v2';

import { runWorkflowWith } from './engine';
import { createFirestoreDeps } from './firestore-deps';
import { WorkflowContext } from './types';

export { runWorkflowWith } from './engine';
export * from './types';

/**
 * Evaluate the tenant's rules for one domain event.
 *
 * Never throws: a failing rule must not roll back or retry the write that produced the
 * event. Per-rule failures are already caught inside the engine and logged as
 * activities; this catch is the backstop for the rule query itself.
 */
export async function runWorkflow(ctx: WorkflowContext): Promise<void> {
  try {
    await runWorkflowWith(ctx, createFirestoreDeps());
  } catch (error) {
    logger.error(`workflow: ${ctx.event} failed for ${ctx.relatedKey}`, error);
  }
}
