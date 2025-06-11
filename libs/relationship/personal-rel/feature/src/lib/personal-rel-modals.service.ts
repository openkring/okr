import { inject, Injectable } from "@angular/core";
import { AppStore } from "@bk2/auth/feature";
import { convertFormToNewPersonalRel, PersonalRelNewFormModel } from "@bk2/personal-rel/util";
import { PersonalRelModel, PersonModel } from "@bk2/shared/models";
import { isPerson, isPersonalRel } from "@bk2/shared/util";
import { ModalController } from "@ionic/angular/standalone";
import { PersonalRelNewModalComponent } from "./personal-rel-new.modal";
import { PersonalRelEditModalComponent } from "./personal-rel-edit.modal";
import { PersonalRelService } from "@bk2/personal-rel/data-access";
import { PersonSelectModalComponent } from "@bk2/shared/feature";

@Injectable({
    providedIn: 'root'
})
export class PersonalRelModalsService {
  private readonly personalRelService = inject(PersonalRelService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  private readonly tenantId = this.appStore.tenantId()

 /**
   * Show a modal to add a new personalRel.
   * @param subject first person to be related
   * @param object second person to be related
   */
  public async add(subject?: PersonModel, object?: PersonModel): Promise<void> {
    const _subject = structuredClone(subject ?? await this.selectPerson());
    const _object = structuredClone(object ?? await this.selectPerson());
    if (_subject && _object) {
      const _modal = await this.modalController.create({
        component: PersonalRelNewModalComponent,
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
        const _personalRel = convertFormToNewPersonalRel(data as PersonalRelNewFormModel, this.tenantId);
        await this.personalRelService.create(_personalRel, this.appStore.currentUser());
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

  /**
   * Show a modal to edit an existing personalRel.
   * @param personalRel the personalRel to edit
   */
  public async edit(personalRel?: PersonalRelModel): Promise<void> {
    let _personalRel = personalRel;
    _personalRel ??= new PersonalRelModel(this.tenantId);
    
    const _modal = await this.modalController.create({
      component: PersonalRelEditModalComponent,
      componentProps: {
        personalRel: _personalRel,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    await _modal.onWillDismiss();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isPersonalRel(data, this.tenantId)) {
        await (!data.bkey ? this.personalRelService.create(data) : this.personalRelService.update(data));
      }
    }  }

}