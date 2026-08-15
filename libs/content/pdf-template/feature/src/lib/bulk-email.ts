// libs/content/pdf-template/feature/src/lib/bulk-email.ts
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AddressCollection, AddressModel } from '@okr/shared-models';
import { DistributionList, DistributionListModal } from '@okr/shared-ui';
import { EmailEntry } from '@okr/shared-util-angular';
import { getSystemQuery } from '@okr/shared-util-core';
import { EmailComposerModal } from '@okr/content-pdf-template-ui';

/** What a list store has to hand over to run the bulk-mail flow. */
export interface BulkEmailContext {
  modalController: ModalController;
  firestoreService: FirestoreService;
  appStore: InstanceType<typeof AppStore>;
  tenantId: string;
}

/**
 * The two-step bulk-mail flow shared by the person and membership lists:
 * "Verteiler vorbereiten" (to/cc/bcc) → the email composer, which sends in throttled blocks.
 *
 * `to` offers the default org's email addresses (favourite preselected), `bcc` the given
 * recipients. Does nothing if the user cancels either modal.
 * @param attachment an already stored file (storage path + filename) to attach, e.g. a minutes PDF
 */
export async function openBulkEmailFlow(
  ctx: BulkEmailContext,
  recipients: EmailEntry[],
  attachment?: { storagePath: string; filename: string },
): Promise<void> {
  const { orgEmails, favOrgEmail } = await loadOrgEmails(ctx);

  const listModal = await ctx.modalController.create({
    component: DistributionListModal,
    componentProps: { orgEmails, favOrgEmail, recipients },
  });
  await listModal.present();
  const { data, role } = await listModal.onWillDismiss<DistributionList>();
  if (role !== 'confirm' || !data) return;

  const composer = await ctx.modalController.create({
    component: EmailComposerModal,
    componentProps: {
      to: data.to.join(', '),
      cc: data.cc.join(', '),
      bcc: data.bcc.join(', '),
      storagePath: attachment?.storagePath ?? '',
      filename: attachment?.filename ?? '',
    },
  });
  await composer.present();
  await composer.onWillDismiss();
}

/** All email addresses of the tenant's own org, plus its favourite one. */
async function loadOrgEmails(ctx: BulkEmailContext): Promise<{ orgEmails: string[]; favOrgEmail: string }> {
  const parentKey = `org.${ctx.tenantId}`;
  const query = getSystemQuery(ctx.tenantId);
  query.push({ key: 'parentKey', operator: '==', value: parentKey });
  query.push({ key: 'addressChannel', operator: '==', value: 'email' });
  const addresses = await ctx.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
  const orgEmails = addresses.map(a => a.email).filter(Boolean);
  const favEmail = ctx.appStore.getDirectoryEntry(parentKey)?.favEmail ?? '';
  return { orgEmails, favOrgEmail: favEmail || orgEmails[0] || '' };
}
