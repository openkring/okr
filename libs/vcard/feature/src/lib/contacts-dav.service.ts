import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { ContactsDavAdminRequest, ContactsDavStatus, VCARD_I18N_KEYS, VcardI18n } from '@okr/vcard-util';

const REGION = 'europe-west6';

/**
 * «Adressbuch auf Mac und iPhone» (spec 1.159 §7.4): the client side of the `contactsDavAdmin`
 * callable, and the entry point the person list's context menu calls.
 */
@Injectable({ providedIn: 'root' })
export class ContactsDavService {
  private readonly modalController = inject(ModalController);
  private readonly alertService = inject(AlertService);
  private readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;
  private readonly functions = getFunctions(getApp(), REGION);

  /** One op of the admin callable; the answer always carries the current status. */
  public async call(request: ContactsDavAdminRequest): Promise<ContactsDavStatus> {
    const fn = httpsCallable<ContactsDavAdminRequest, ContactsDavStatus>(this.functions, 'contactsDavAdmin');
    return (await fn(request)).data;
  }

  public async open(tenantId: string): Promise<void> {
    let status: ContactsDavStatus;
    try {
      status = await this.call({ tenantId, op: 'status' });
    } catch (e) {
      console.error('ContactsDavService.open: status failed', e);
      this.alertService.error(this.i18n.dav_error());
      return;
    }
    // dynamic import: the modal injects this service, a static import would be circular
    const { ContactsDavModal } = await import('./contacts-dav.modal');
    const modal = await this.modalController.create({ component: ContactsDavModal, componentProps: { tenantId, initial: status } });
    await modal.present();
  }
}
