import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { OrgModel, PersonModel, WorkrelModel } from "@bk2/shared-models";
import { selectDate } from "@bk2/shared-ui";
import { convertDateFormatToString, DateFormat, isOrg, isPerson } from "@bk2/shared-util-core";

import { WorkrelService } from "@bk2/relationship-workrel-data-access";

@Injectable({
  providedIn: 'root'
})
export class WorkrelModalsService {
  private readonly appStore = inject(AppStore);
  private readonly modalController = inject(ModalController);
  private readonly workrelService = inject(WorkrelService);

  private readonly tenantId = this.appStore.tenantId();

  public async selectPerson(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  public async selectOrg(): Promise<OrgModel | undefined> {
    const modal = await this.modalController.create({
      component: OrgSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  /**
   * End an existing workrel.
   * @param workrel the work relationship to delete, its bkey needs to be valid so that we can find it in the database. 
   */
  public async end(workrel: WorkrelModel): Promise<void> {
    const date = await selectDate(this.modalController);
    if (!date) return;
    const endDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false);
    await this.workrelService.endWorkrelByDate(workrel, endDate, this.appStore.currentUser());
  }

}