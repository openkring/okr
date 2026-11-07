// libs/content/pdf-template/feature/src/lib/bulk-email.ts
import { ModalController } from '@ionic/angular';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import {
  AddressCollection, AddressModel, CalendarCollection, CalendarModel, CalEventCollection, CalEventModel,
  MembershipCollection, MembershipModel, PersonModel,
} from '@okr/shared-models';
import { addDuration, getFullName, getSystemQuery, getTodayStr, isActiveMembership } from '@okr/shared-util-core';
import { type VersandEvent, VERSAND_EVENT_MONTHS, versandEventsOf } from '@okr/content-pdf-template-util';
import { type ComposedEmail, EmailComposerModal, type VersandRecipient } from '@okr/content-pdf-template-ui';

export type { ComposedEmail, VersandRecipient };

/** What a list store has to hand over to run the bulk-mail flow. */
export interface BulkEmailContext {
  modalController: ModalController;
  firestoreService: FirestoreService;
  appStore: InstanceType<typeof AppStore>;
  tenantId: string;
}

/**
 * The persons of a list as Versand recipients, sorted by last name. Unlike a mail list, a person
 * without an email address stays in: the Zustellung table may still reach them another way.
 */
export function toVersandRecipients(persons: PersonModel[], getEmail: (person: PersonModel) => string | undefined): VersandRecipient[] {
  return [...persons]
    .filter((p) => !!p.okey)
    .sort((a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? ''))
    .map((p) => ({ personKey: p.okey, name: getFullName(p.firstName, p.lastName), email: getEmail(p) ?? '' }));
}

/**
 * The Versand flow shared by the person, membership and meeting lists (spec 1.145): one modal,
 * «Versand vorbereiten», with the segments Editor, Vorschau, Zustellung and Verteiler.
 *
 * `to` is the default org's favourite email address; the Bcc follows from the Zustellung table,
 * which the composer loads for `recipients` (persons without an email address included, they may
 * be reachable another way). Does nothing more if the user cancels.
 * @param attachment an already stored file (storage path + filename) to attach, e.g. a minutes PDF
 * @param sendHandler sends instead of the `mailJobs` queue, for a caller the queue's rule keeps out
 *        (a group admin); the server then decides the sender, so the composer locks that field
 * @param groupKey a group admin's Versand: the server only reports on the group's members
 */
export async function openBulkEmailFlow(
  ctx: BulkEmailContext,
  recipients: VersandRecipient[],
  attachment?: { storagePath: string; filename: string },
  sendHandler?: (mail: ComposedEmail) => Promise<void>,
  groupKey?: string,
): Promise<void> {
  const { favOrgEmail } = await loadOrgEmails(ctx);
  // A group admin's Versand never carries answer links (the server refuses them): no events to load.
  const { events, membersByGroup } = groupKey ? { events: [], membersByGroup: {} } : await loadVersandEvents(ctx);
  const composer = await ctx.modalController.create({
    component: EmailComposerModal,
    componentProps: {
      to: favOrgEmail,
      versandRecipients: recipients,
      groupKey: groupKey ?? '',
      versandEvents: events,
      membersByGroup,
      storagePath: attachment?.storagePath ?? '',
      filename: attachment?.filename ?? '',
      sendHandler,
      fromLocked: !!sendHandler,
    },
    cssClass: ['wide-modal', 'auto-height-modal'],
  });
  await composer.present();
  await composer.onWillDismiss();
}

/**
 * All email addresses of the tenant's own org, plus its favourite one. Raw addresses are for
 * privileged users and memberAdmins, and a denied read comes back empty: everybody else gets the
 * favourite from the directory, without which the list could never be confirmed.
 */
async function loadOrgEmails(ctx: BulkEmailContext): Promise<{ orgEmails: string[]; favOrgEmail: string }> {
  const parentKey = `org.${ctx.tenantId}`;
  const query = getSystemQuery(ctx.tenantId);
  query.push({ key: 'parentKey', operator: '==', value: parentKey });
  query.push({ key: 'addressChannel', operator: '==', value: 'email' });
  const addresses = await ctx.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
  const orgEmails = addresses.map(a => a.email).filter(Boolean);
  const favEmail = ctx.appStore.getDirectoryEntry(parentKey)?.favEmail ?? '';
  if (orgEmails.length === 0 && favEmail) orgEmails.push(favEmail);
  return { orgEmails, favOrgEmail: favEmail || orgEmails[0] || '' };
}

/**
 * The tenant's events a Versand can ask about (see `versandEventsOf`: from today up to six months ahead, not
 * personal, archived, cancelled, locked or a poll date, by date), each with the group whose calendar it sits
 * in, plus the active member person keys of those groups. A read that fails comes back empty: the «Anlässe»
 * field is then simply not offered. A multi-day event that already started is not offered: catching it
 * would need an `endDate` range query, and with it a new index.
 */
async function loadVersandEvents(ctx: BulkEmailContext): Promise<{ events: VersandEvent[]; membersByGroup: Record<string, string[]> }> {
  const today = getTodayStr();
  const eventQuery = getSystemQuery(ctx.tenantId);
  eventQuery.push({ key: 'startDate', operator: '>=', value: today });
  eventQuery.push({ key: 'startDate', operator: '<=', value: addDuration(today, { months: VERSAND_EVENT_MONTHS }) });
  const [calevents, calendars] = await Promise.all([
    ctx.firestoreService.getDataOnce<CalEventModel>(CalEventCollection, eventQuery, 'startDate'),
    ctx.firestoreService.getDataOnce<CalendarModel>(CalendarCollection, getSystemQuery(ctx.tenantId)),
  ]);
  const events = versandEventsOf(calevents, calendars, today);

  const groupKeys = [...new Set(events.map((e) => e.groupKey).filter((key): key is string => !!key))];
  const membersByGroup: Record<string, string[]> = {};
  await Promise.all(groupKeys.map(async (groupKey) => {
    const query = getSystemQuery(ctx.tenantId);
    query.push({ key: 'memberModelType', operator: '==', value: 'person' });
    query.push({ key: 'orgKey', operator: '==', value: groupKey });
    query.push({ key: 'orgModelType', operator: '==', value: 'group' });
    const memberships = await ctx.firestoreService.getDataOnce<MembershipModel>(MembershipCollection, query, 'memberName2');
    membersByGroup[groupKey] = memberships.filter((m) => isActiveMembership(m, today)).map((m) => m.memberKey);
  }));
  return { events, membersByGroup };
}
