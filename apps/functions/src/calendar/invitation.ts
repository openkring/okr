// apps/functions/src/calendar/invitation.ts
//
// A new invitation notifies the invitee over their channels (spec 1.73 §3): push opening the
// event, and/or an email with signed «ich nehme teil / nicht teil» links (answer-link.ts).
// Create-only and read-only on the invitation: `sentAt` is stamped by the client.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { projectID } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

import { answerFunctionUrl, answerUrl, invitationLinkSecret } from './answer-link';
import { eventUrl, notifyPersons, tenantLinks } from './deliver';
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
  startTime?: string;
  locationKey?: string;
  isArchived?: boolean;
}

export function shouldNotifyInvitation(inv: InvitationDoc, event: AnswerableEvent | undefined, today: string): boolean {
  if (inv.isArchived || inv.state !== 'pending') return false;
  if (!inv.tenants?.[0] || !inv.inviteeKey || !inv.caleventKey) return false;
  if (!event || event.isArchived) return false;
  return (event.startDate ?? '') >= today;
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
    if (!links.appUrl) logger.warn(`${CF_NAME}: tenant ${tenantId} has no appDomain, email links are relative`);

    await notifyPersons({
      personKeys: [inviteeKey],
      tenantId,
      ruleKey: `calevent:${caleventKey}`,
      context: CF_NAME,
      push: {
        type: 'calevent',
        tenantId,
        title: event.name ?? '',
        body: invitationPushBody(inviterName, when),
        url: caleventDeepLink(caleventKey),
        channelId: `invitation.${invitationKey}`,
      },
      email: () => invitationEmail({
        appName: links.appName,
        eventName: event.name ?? '',
        when,
        location: locationLabel(event.locationKey),
        inviterName,
        note: inv.notes ?? '',
        eventUrl: eventUrl(links, caleventKey),
        acceptUrl: answerUrl(base, invitationKey, inviteeKey, 'accept', secret),
        declineUrl: answerUrl(base, invitationKey, inviteeKey, 'decline', secret),
      }),
    });
  },
);
