// apps/functions/src/calendar/invitation.ts
//
// A new invitation notifies the invitee over their channels (spec 1.73 §3): push opening the
// event, and/or an email with one signed «Antworten» link to the answer page (answer-link.ts).
// Read-only on the invitation: `sentAt` is stamped by the client.
//
// Both triggers also keep the invitation part of the invitee's server badge ledger (spec 1.127
// §3.7 B1): `onInvitationCreated` recomputes it before its push (which reads the sum for
// `aps.badge`), `onInvitationWritten` on every later change that can move the count — answered,
// archived, locked, deleted, re-addressed. Recomputed, never +1: the server can read the truth.

import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { projectID } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

import { setBadgePartForPerson } from '../badge/person-part';
import { answerFunctionUrl, invitationLinkSecret, respondUrl } from './answer-link';
import { brandOf, notifyPersons, tenantLinks } from './deliver';
import { eventWhen, invitationEmail, locationLabel } from './mail';
import { countOpenInvitations } from './invitation-count';
import { caleventDeepLink, todayStoreDate } from './recipients';

const REGION = 'europe-west6';
const CF_NAME = 'onInvitationCreated';

export interface InvitationDoc {
  tenants?: string[];
  date?: string;
  inviteeKey?: string;
  inviterFirstName?: string;
  inviterLastName?: string;
  caleventKey?: string;
  notes?: string;
  state?: string;
  isArchived?: boolean;
  isLocked?: boolean;
}

export interface AnswerableEvent {
  name?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  locationKey?: string;
  isArchived?: boolean;
  isLocked?: boolean;
  state?: string;
}

/**
 * Whether a new invitation is pushed/mailed: only when the invitee can actually answer it.
 * keep in sync with libs/shared/util-core/src/lib/invitation.util.ts:isCountableInvitation (and
 * calevent-attendance.util.ts:isCaleventAttendanceClosed) — the app badge and the dashboard
 * invitations card count with that rule, so no push announces an invitation they would not show
 * (spec 1.127 2.4). Differences: the push needs an event (no caleventKey, nothing to open) and
 * the open-invitation date check is replaced by the event's last day.
 * Legacy event docs may lack isLocked/state: undefined reads as "not locked / not cancelled".
 */
export function shouldNotifyInvitation(inv: InvitationDoc, event: AnswerableEvent | undefined, today: string): boolean {
  if (inv.isArchived || inv.isLocked || inv.state !== 'pending') return false;
  if (!inv.tenants?.[0] || !inv.inviteeKey || !inv.caleventKey) return false;
  if (!event || event.isArchived || event.isLocked || event.state === 'cancelled') return false;
  return (event.endDate || event.startDate || '') >= today;
}

/** The fields `countOpenInvitations` (and so the badge) depends on. */
const COUNTED_FIELDS = ['state', 'isArchived', 'isLocked', 'inviteeKey', 'caleventKey', 'date'] as const;

/**
 * Whether a write changes an invitation the badge counts: a delete, or a change of a counted
 * field or of `tenants`. False on create — `onInvitationCreated` recomputes then — and on any
 * other field (notes, sentAt, the inviter's name).
 */
export function shouldRecomputeInvitations(before: InvitationDoc | undefined, after: InvitationDoc | undefined): boolean {
  if (!before) return false;
  if (!after) return true;
  if (COUNTED_FIELDS.some((field) => before[field] !== after[field])) return true;
  return (before.tenants ?? []).join('\u0000') !== (after.tenants ?? []).join('\u0000');
}

/** The invitees whose count a write can move: the previous and the new one, each once. */
export function inviteesToRecompute(before: InvitationDoc | undefined, after: InvitationDoc | undefined): string[] {
  return [...new Set([before?.inviteeKey ?? '', after?.inviteeKey ?? ''].filter((key) => key.length > 0))];
}

/** Recomputes the invitation part of the person's ledger in the tenant; never throws. */
function recomputeInvitationBadge(personKey: string, tenantId: string, context: string): Promise<void> {
  return setBadgePartForPerson(personKey, tenantId, 'invitations', () => countOpenInvitations(personKey, tenantId), context);
}

export function invitationPushBody(inviterName: string, when: string): string {
  return when ? `${inviterName} lädt dich ein: ${when}` : `${inviterName} lädt dich ein`;
}

export const onInvitationCreated = onDocumentCreated(
  { document: 'invitations/{invitationId}', region: REGION, secrets: [invitationLinkSecret] },
  async (trigger) => {
    const inv = trigger.data?.data() as InvitationDoc | undefined;
    if (!inv) return;
    const invitationKey = trigger.params.invitationId;
    // Before the push below: it reads the ledger sum for the native badge.
    await recomputeInvitationBadge(inv.inviteeKey ?? '', inv.tenants?.[0] ?? '', CF_NAME);
    const eventSnap = inv.caleventKey ? await getFirestore().collection('calevents').doc(inv.caleventKey).get() : undefined;
    const event = eventSnap?.exists ? (eventSnap.data() as AnswerableEvent) : undefined;
    if (!shouldNotifyInvitation(inv, event, todayStoreDate()) || !event) return;

    const tenantId = inv.tenants?.[0] ?? '';
    const caleventKey = inv.caleventKey ?? '';
    const inviteeKey = inv.inviteeKey ?? '';
    const inviterName = `${inv.inviterFirstName ?? ''} ${inv.inviterLastName ?? ''}`.trim();
    const when = eventWhen(event.startDate, event.startTime);
    const links = await tenantLinks(tenantId);
    const secret = invitationLinkSecret.value();
    const base = answerFunctionUrl(projectID.value());

    await notifyPersons({
      personKeys: [inviteeKey],
      tenantId,
      ruleKey: `calevent:${caleventKey}`,
      context: CF_NAME,
      // a guest without an app account answers through the signed links in the email
      emailWithoutAccount: true,
      push: {
        type: 'calevent',
        tenantId,
        title: event.name ?? '',
        body: invitationPushBody(inviterName, when),
        url: caleventDeepLink(caleventKey),
        channelId: `invitation.${invitationKey}`,
        // web: one new open invitation → +1 in the device ledger, de-duplicated by key (spec
        // 1.93); the service worker needs it. Native badges use the recomputed server ledger.
        badgeAdd: 'invitation',
        badgeId: invitationKey,
      },
      email: () => invitationEmail({
        ...brandOf(links),
        eventName: event.name ?? '',
        when,
        location: locationLabel(event.locationKey),
        inviterName,
        note: inv.notes ?? '',
        respondUrl: respondUrl(base, invitationKey, inviteeKey, secret),
      }),
    });
  },
);

/**
 * Keeps the invitation part of the server badge ledger on every later change (see file head).
 * Creates are skipped — `onInvitationCreated` handles them. A change of tenant recomputes the
 * new tenant; the account of the old one is corrected when its app opens.
 */
export const onInvitationWritten = onDocumentWritten(
  // explicit cap (europe-west6 CPU quota is full, see init.ts)
  { document: 'invitations/{invitationId}', region: REGION, maxInstances: 5 },
  async (trigger) => {
    const before = trigger.data?.before?.exists ? (trigger.data.before.data() as InvitationDoc) : undefined;
    const after = trigger.data?.after?.exists ? (trigger.data.after.data() as InvitationDoc) : undefined;
    if (!shouldRecomputeInvitations(before, after)) return;
    const tenantId = (after ?? before)?.tenants?.[0] ?? '';
    for (const personKey of inviteesToRecompute(before, after)) {
      await recomputeInvitationBadge(personKey, tenantId, 'onInvitationWritten');
    }
  },
);
