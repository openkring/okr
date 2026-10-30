// apps/functions/src/calendar/invitation.ts
//
// A new invitation notifies the invitee over their channels (spec 1.73 §3): push opening the
// event, and/or an email with one signed «Antworten» link to the answer page (answer-link.ts).
// Create-only and read-only on the invitation: `sentAt` is stamped by the client.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { projectID } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

import { answerFunctionUrl, invitationLinkSecret, respondUrl } from './answer-link';
import { brandOf, notifyPersons, tenantLinks } from './deliver';
import { eventWhen, invitationEmail, locationLabel } from './mail';
import { caleventDeepLink, todayStoreDate } from './recipients';

const REGION = 'europe-west6';
const CF_NAME = 'onInvitationCreated';

export interface InvitationDoc {
  tenants?: string[];
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

export function invitationPushBody(inviterName: string, when: string): string {
  return when ? `${inviterName} lädt dich ein: ${when}` : `${inviterName} lädt dich ein`;
}

export const onInvitationCreated = onDocumentCreated(
  { document: 'invitations/{invitationId}', region: REGION, secrets: [invitationLinkSecret] },
  async (trigger) => {
    const inv = trigger.data?.data() as InvitationDoc | undefined;
    if (!inv) return;
    const invitationKey = trigger.params.invitationId;
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
        // one new open invitation → +1 on the badge, de-duplicated by key (spec 1.93)
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
