import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { OrgModel, PersonModel, WorkingRelModel } from "@bk2/shared/models";
import { convertDateFormatToString, DateFormat, isOrg, isPerson } from "@bk2/shared/util-core";
import { AppStore, PersonSelectModalComponent, OrgSelectModalComponent } from '@bk2/shared/feature';
import { selectDate } from "@bk2/shared/ui";

import { WorkingRelService } from "@bk2/working-rel/data-access";

@Injectable({
    providedIn: 'root'
})
export class WorkingRelModalsService {
  private readonly appStore = inject(AppStore);
  private readonly modalController = inject(ModalController);
  private readonly workingRelService = inject(WorkingRelService);

  private readonly tenantId = this.appStore.tenantId();

 public async selectPerson(): Promise<PersonModel | undefined> {
    const _modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  public async selectOrg(): Promise<OrgModel | undefined> {
    const _modal = await this.modalController.create({
      component: OrgSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  /**
   * End an existing workingRel.
   * @param workingRel the workingRel to delete, its bkey needs to be valid so that we can find it in the database. 
   */
  public async end(workingRel: WorkingRelModel): Promise<void> {
    const _date = await selectDate(this.modalController);
    if (!_date) return;
    await this.workingRelService.endWorkingRelByDate(workingRel, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), this.tenantId, this.appStore.currentUser());    
  }

}