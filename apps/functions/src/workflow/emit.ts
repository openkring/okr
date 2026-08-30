// apps/functions/src/workflow/emit.ts
//
// Event producers other than the membership sync
// (planning/specs/2026-08-15-approval-workflow-spec.md §1.2,
//  planning/specs/2026-08-29-generic-workflow-triggers-spec.md §4 and §6c).
//
// Two mechanisms, chosen per source and not by taste:
//  - inside the callable, where the callable is the ONLY write path (expenses and the
//    forms pipeline are CF-write-only in firestore.rules) — no second trigger and no
//    second definition of "created";
//  - a Firestore onDocumentCreated trigger, where clients write the collection directly
//    (reservations, applications) — a callable-side emit there would miss imports and
//    admin edits, which is the same argument that put the engine server-side.
//
// The create-triggers of the second kind are TABLE-DRIVEN (§6c): adding a collection to the
// workflow surface costs a row in CREATED_EMITTERS plus a `workflow_event` category item —
// still a deploy, because Firebase needs a distinct export per trigger, but no new code path
// and no new definition of "created". Emitters that do MORE than lift fields keep their own
// bodies: `onTaskCompleted` (a transition guard), `onApplicationStateChanged` (a before/after
// comparison) and the membership emitters in `auth/account-sync.ts`.

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

import { ApplicationCollection, AvatarInfo, ReservationCollection, TaskCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { runWorkflow } from './index';

const REGION = 'europe-west6';

/** A Firestore document as it arrives from `snapshot.data()`. */
export type DocData = Record<string, unknown>;

/** Every value that reaches `params` must be a plain string: params are compared by the
 *  `paramIs` probe and substituted into task text, where an `undefined` would render as the
 *  literal "undefined" to a member. */
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const avatarName = (a: { name1?: string; name2?: string } | undefined): string =>
  `${a?.name1 ?? ''} ${a?.name2 ?? ''}`.trim();

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

/**
 * One collection's create-emitter, as data.
 *
 * `params` is exactly the list a `paramIs` probe can match on, which is why the two live next
 * to each other: the list IS the discriminator surface of the event.
 */
export interface CreatedEmitSpec {
  /** the workflow event name, e.g. 'reservation.created' */
  event: string;
  /** relatedKey is `<relatedPrefix>.<docId>`; its first segment is also the task's relatedModelType */
  relatedPrefix: string;
  /** flat document fields lifted verbatim into params, under their own names */
  params: string[];
  /** params that need to reach into a nested field or rename one */
  extraParams?: (d: DocData) => Record<string, string>;
  /** the SUBJECT of the event — '' when the record has no person yet */
  personKey?: (d: DocData) => string;
  subjectName?: (d: DocData) => string;
}

export const CREATED_EMITTERS: Record<string, CreatedEmitSpec> = {
  /** `reservations` is client-written, so the trigger is the only complete emit point. */
  [ReservationCollection]: {
    event: 'reservation.created',
    relatedPrefix: 'reservation',
    params: ['startDate', 'endDate', 'state'],
    extraParams: (d) => {
      const resource = d['resource'] as { key?: string; type?: string; name1?: string } | undefined;
      return {
        resourceKey: str(resource?.key),
        resourceType: str(resource?.type),
        resourceName: str(resource?.name1),
      };
    },
    personKey: (d) => str((d['reserver'] as { key?: string } | undefined)?.key),
    subjectName: (d) => avatarName(d['reserver'] as { name1?: string; name2?: string } | undefined),
  },

  /** `applications` is client-written (public admission forms included) — same reasoning. */
  [ApplicationCollection]: {
    event: 'application.created',
    relatedPrefix: 'application',
    params: ['state'],
    extraParams: (d) => ({ kind: str(d['applicationAs']) }),
    // An applicant is not a person yet — the record carries the name, not a personKey, so the
    // person-scoped probes correctly find nothing.
    personKey: () => '',
    subjectName: (d) => `${str(d['firstName'])} ${str(d['lastName'])}`.trim(),
  },
};

/** The pure core of a created-emitter — everything worth testing without the emulator. */
export function buildEmitArgs(
  spec: CreatedEmitSpec,
  id: string,
  d: DocData,
): { relatedKey: string; personKey: string; subjectName: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  for (const key of spec.params) params[key] = str(d[key]);
  Object.assign(params, spec.extraParams?.(d) ?? {});
  return {
    relatedKey: `${spec.relatedPrefix}.${id}`,
    personKey: spec.personKey?.(d) ?? '',
    subjectName: spec.subjectName?.(d) ?? '',
    params,
  };
}

/** Build one `onDocumentCreated` trigger from a table row. */
function createdEmitter(collection: string, spec: CreatedEmitSpec) {
  return onDocumentCreated({ document: `${collection}/{id}`, region: REGION }, async (event) => {
    const d = event.data?.data() as DocData | undefined;
    if (!d) return;
    const id = event.params['id'];
    const args = buildEmitArgs(spec, id, d);
    for (const tenantId of (d['tenants'] as string[] | undefined) ?? []) {
      await emitEvent(spec.event, tenantId, args.relatedKey, args);
    }
    logger.info(`createdEmitter(${collection}): emitted ${spec.event} for ${id}`);
  });
}

// Firebase needs a distinct export per trigger, but not a distinct hand-written body.
export const onReservationCreated = createdEmitter(ReservationCollection, CREATED_EMITTERS[ReservationCollection]);
export const onApplicationCreated = createdEmitter(ApplicationCollection, CREATED_EMITTERS[ApplicationCollection]);

/** The state a task reaches when it is done; the `task_state` category item of the same name. */
const DONE = 'done';

/**
 * `tasks` is client-written (board drag, edit modal, meeting minutes), so the trigger is
 * the only complete emit point.
 *
 * Fires on the TRANSITION into 'done' only — a later edit of an already-done task (a note,
 * a tag, a rank) must not notify again. The `state === 'done' <=> completionDate is set`
 * invariant (task spec §6.2) makes `state` the single thing to watch. This guard is why the
 * emitter is not a CREATED_EMITTERS row.
 *
 * The event's SUBJECT is the author, so a rule with `responsibilityKey: 'subject'` reaches
 * them; `authorIsNotAssignee` is the probe that keeps people from being told about their
 * own work.
 */
export const onTaskCompleted = onDocumentUpdated(
  { document: `${TaskCollection}/{id}`, region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if ((before['state'] as string) === DONE || (after['state'] as string) !== DONE) return;

    const author = after['author'] as AvatarInfo | undefined;
    const assignee = after['assignee'] as AvatarInfo | undefined;
    for (const tenantId of (after['tenants'] as string[] | undefined) ?? []) {
      await emitEvent('task.completed', tenantId, `task.${event.params['id']}`, {
        personKey: author?.key ?? '',
        subjectName: (after['name'] as string) ?? '',
        params: {
          taskName: (after['name'] as string) ?? '',
          authorKey: author?.key ?? '',
          authorName: avatarName(author),
          assigneeKey: assignee?.key ?? '',
          assigneeName: avatarName(assignee),
          completionDate: (after['completionDate'] as string) ?? '',
        },
      });
    }
    logger.info(`onTaskCompleted: emitted for ${event.params['id']}`);
  },
);

/**
 * True only when `state` actually changed.
 *
 * Without this guard EVERY edit of an application — a corrected phone number, a note, an
 * admin re-save — would re-fire the event and, with a `sendMessage` rule, message the
 * responsible person again. `openTask` would deduplicate, but the messaging actions do not.
 */
export function isStateChange(before: DocData, after: DocData): boolean {
  return str(before['state']) !== str(after['state']);
}

/**
 * The public admission path emits on create but never again, so "an application was accepted /
 * rejected / withdrawn" could not drive a rule. Combined with `paramIs:state=accepted` this
 * closes the admission loop without a bespoke callable (spec 2026-08-29 §4).
 *
 * `personKey` stays empty for the same reason as on create: an applicant is not a person yet.
 */
export const onApplicationStateChanged = onDocumentUpdated(
  { document: `${ApplicationCollection}/{id}`, region: REGION },
  async (event) => {
    const before = event.data?.before.data() as DocData | undefined;
    const after = event.data?.after.data() as DocData | undefined;
    if (!before || !after) return;
    if (!isStateChange(before, after)) return;

    for (const tenantId of (after['tenants'] as string[] | undefined) ?? []) {
      await emitEvent('application.stateChanged', tenantId, `application.${event.params['id']}`, {
        personKey: '',
        subjectName: `${str(after['firstName'])} ${str(after['lastName'])}`.trim(),
        params: {
          state: str(after['state']),
          fromState: str(before['state']),
          kind: str(after['applicationAs']),
        },
      });
    }
    logger.info(`onApplicationStateChanged: emitted for ${event.params['id']}`);
  },
);
