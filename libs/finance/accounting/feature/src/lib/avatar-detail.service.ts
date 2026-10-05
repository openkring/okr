import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { AvatarInfo, OrgModelName, PersonModelName } from '@okr/shared-models';
import { warn } from '@okr/shared-util-core';
import { OrgService } from '@okr/subject-org-data-access';
import { ORG_EDIT_MODAL } from '@okr/subject-org-ui';
import { PERSON_EDIT_MODAL } from '@okr/subject-person-ui';

/**
 * Opens the person or org behind an AvatarInfo (invoice receiver, bill vendor) read-only, on top of
 * the modal it is tapped in. The edit modals come through loader tokens the apps provide: finance
 * cannot import @okr/subject-org-feature, which itself depends on the bill and invoice features.
 */
@Injectable({ providedIn: 'root' })
export class AvatarDetailService {
  private readonly appStore = inject(AppStore);
  private readonly orgService = inject(OrgService);
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  private readonly personEditModal = inject(PERSON_EDIT_MODAL, { optional: true });
  private readonly orgEditModal = inject(ORG_EDIT_MODAL, { optional: true });

  public async show(avatar: AvatarInfo | undefined): Promise<void> {
    if (!avatar?.key) return;
    if (avatar.modelType === PersonModelName) await this.showPerson(avatar.key);
    else if (avatar.modelType === OrgModelName) await this.showOrg(avatar.key);
  }

  private async showPerson(personKey: string): Promise<void> {
    const person = this.appStore.getPerson(personKey);
    if (!person || !this.personEditModal) {
      // not among the loaded persons (or no loader): the person page, after closing the modal
      await this.modalController.dismiss().catch(() => undefined);
      this.appStore.appNavigationService.resetLinkHistory(this.router.url);
      this.appStore.appNavigationService.pushLink(`/person/${personKey}`);
      await this.router.navigate(['/person', personKey]);
      return;
    }
    const PersonEditModal = await this.personEditModal();
    const modal = await this.modalController.create({
      component: PersonEditModal,
      componentProps: {
        person,
        currentUser: this.appStore.currentUser(),
        tags: this.appStore.getTags(PersonModelName),
        tenantId: this.appStore.tenantId(),
        genders: this.appStore.getCategory('gender'),
        readOnly: true,
      },
    });
    await modal.present();
    await modal.onDidDismiss();
  }

  private async showOrg(orgKey: string): Promise<void> {
    if (!this.orgEditModal) { warn('AvatarDetailService.showOrg: ORG_EDIT_MODAL is not provided by this app'); return; }
    const org = await firstValueFrom(this.orgService.read(orgKey).pipe(take(1)));
    if (!org) { warn(`AvatarDetailService.showOrg: org ${orgKey} not found`); return; }
    const OrgEditModal = await this.orgEditModal();
    const modal = await this.modalController.create({
      component: OrgEditModal,
      componentProps: { org, currentUser: this.appStore.currentUser(), tags: '', readOnly: true },
    });
    await modal.present();
    await modal.onDidDismiss();
  }
}
