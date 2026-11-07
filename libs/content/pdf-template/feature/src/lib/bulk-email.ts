// libs/content/pdf-template/feature/src/lib/bulk-email.ts
import { ModalController } from '@ionic/angular';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AddressCollection, AddressModel, PersonModel } from '@okr/shared-models';
import { getFullName, getSystemQuery } from '@okr/shared-util-core';
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
  const composer = await ctx.modalController.create({
    component: EmailComposerModal,
    componentProps: {
      to: favOrgEmail,
      versandRecipients: recipients,
      groupKey: groupKey ?? '',
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
