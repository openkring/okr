// apps/functions/src/workflow/emit.ts
//
// Event producers other than the membership sync
// (planning/specs/2026-08-15-approval-workflow-spec.md §1.2).
//
// Two mechanisms, chosen per source and not by taste:
//  - inside the callable, where the callable is the ONLY write path (expenses and the
//    forms pipeline are CF-write-only in firestore.rules) — no second trigger and no
//    second definition of "created";
//  - a Firestore onDocumentCreated trigger, where clients write the collection directly
//    (reservations, applications) — a callable-side emit there would miss imports and
//    admin edits, which is the same argument that put the engine server-side.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

import { ApplicationCollection, ReservationCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { runWorkflow } from './index';

const REGION = 'europe-west6';

/**
 * Emit one domain event. Best-effort by construction: runWorkflow never throws, so a
 * workflow failure can never fail the expense upload or form submission that produced it.
 */
export async function emitEvent(
  event: string,
  tenantId: string,
  relatedKey: string,
  opts: { personKey?: string; subjectName?: string; params?: Record<string, string> } = {},
): Promise<void> {
  if (!tenantId) return;
  await runWorkflow({
    tenantId,
    event,
    personKey: opts.personKey ?? '',
    relatedKey,
    subjectName: opts.subjectName ?? '',
    today: getTodayStr(DateFormat.StoreDate),
    params: opts.params ?? {},
  });
}

/** `reservations` is client-written, so the trigger is the only complete emit point. */
export const onReservationCreated = onDocumentCreated(
  { document: `${ReservationCollection}/{id}`, region: REGION },
  async (event) => {
    const r = event.data?.data();
    if (!r) return;
    const reserver = r['reserver'] as { key?: string; name1?: string; name2?: string } | undefined;
    const resource = r['resource'] as { key?: string; type?: string; name1?: string } | undefined;
    for (const tenantId of (r['tenants'] as string[] | undefined) ?? []) {
      await emitEvent('reservation.created', tenantId, `reservation.${event.params['id']}`, {
        personKey: reserver?.key ?? '',
        subjectName: `${reserver?.name1 ?? ''} ${reserver?.name2 ?? ''}`.trim(),
        params: {
          resourceKey: resource?.key ?? '',
          resourceType: resource?.type ?? '',
          resourceName: resource?.name1 ?? '',
          startDate: (r['startDate'] as string) ?? '',
          endDate: (r['endDate'] as string) ?? '',
          state: (r['state'] as string) ?? '',
        },
      });
    }
    logger.info(`onReservationCreated: emitted for ${event.params['id']}`);
  },
);

/** `applications` is client-written (public admission forms included) — same reasoning. */
export const onApplicationCreated = onDocumentCreated(
  { document: `${ApplicationCollection}/{id}`, region: REGION },
  async (event) => {
    const a = event.data?.data();
    if (!a) return;
    for (const tenantId of (a['tenants'] as string[] | undefined) ?? []) {
      await emitEvent('application.created', tenantId, `application.${event.params['id']}`, {
        // An applicant is not a person yet — the record carries the name, not a personKey,
        // so the person-scoped probes correctly find nothing.
        personKey: '',
        subjectName: `${a['firstName'] ?? ''} ${a['lastName'] ?? ''}`.trim(),
        params: {
          state: (a['state'] as string) ?? '',
          kind: (a['applicationAs'] as string) ?? '',
        },
      });
    }
    logger.info(`onApplicationCreated: emitted for ${event.params['id']}`);
  },
);
