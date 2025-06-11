import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { OrgModel, PersonModel, WorkingRelModel } from "@bk2/shared/models";
import { convertDateFormatToString, DateFormat, isOrg, isPerson } from "@bk2/shared/util";
import { PersonSelectModalComponent, OrgSelectModalComponent } from '@bk2/shared/feature';
import { selectDate } from "@bk2/shared/ui";

import { AppStore } from "@bk2/auth/feature";

import { WorkingRelService } from "@bk2/working-rel/data-access";
import { convertFormToNewWorkingRel, isWorkingRel, WorkingRelNewFormModel } from "@bk2/working-rel/util";
import { WorkingRelNewModalComponent } from "./working-rel-new.modal";
import { WorkingRelEditModalComponent } from "./working-rel-edit.modal";

@Injectable({
    providedIn: 'root'
})
export class WorkingRelModalsService {
  private readonly appStore = inject(AppStore);
  private readonly modalController = inject(ModalController);
  private readonly workingRelService = inject(WorkingRelService);

  private readonly tenantId = this.appStore.env.owner.tenantId;

 /**
   * Show a modal to add a new workingRel.
   * @param subject first person to be related
   * @param object second person to be related
   */
  public async add(subject?: PersonModel, object?: OrgModel): Promise<void> {
    const _subject = structuredClone(subject ?? await this.selectPerson());
    const _object = structuredClone(object ?? await this.selectOrg());
    if (subject && object) {
      const _modal = await this.modalController.create({
        component: WorkingRelNewModalComponent,
        cssClass: 'small-modal',
        componentProps: {
          subject: _subject,
          object: _object,
          currentUser: this.appStore.currentUser()
        }
      });
      _modal.present();
      const { data, role } = await _modal.onDidDismiss();
      if (role === 'confirm') {
        const _workingRel = convertFormToNewWorkingRel(data as WorkingRelNewFormModel, this.tenantId);
        await this.workingRelService.create(_workingRel, this.tenantId, this.appStore.currentUser());
      }
    }
  }

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
   * Show a modal to edit an existing workingRel.
   * @param workingRel the workingRel to edit
   */
  public async edit(workingRel?: WorkingRelModel): Promise<void> {
    let _workingRel = workingRel;
    _workingRel ??= new WorkingRelModel(this.tenantId);
    
    const _modal = await this.modalController.create({
      component: WorkingRelEditModalComponent,
      componentProps: {
        workingRel: _workingRel,
        currentUser: this.appStore.currentUser(),
      }
    });
    _modal.present();
    await _modal.onWillDismiss();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isWorkingRel(data, this.tenantId)) {
        await (!data.bkey ? this.workingRelService.create(data, this.tenantId, this.appStore.currentUser()) : this.workingRelService.update(data));
      }
    }  
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