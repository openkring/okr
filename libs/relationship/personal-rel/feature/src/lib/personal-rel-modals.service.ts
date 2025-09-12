import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore, PersonSelectModalComponent } from "@bk2/shared-feature";
import { PersonModel } from "@bk2/shared-models";
import { isPerson } from "@bk2/shared-util-core";

@Injectable({
    providedIn: 'root'
})
export class PersonalRelModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

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
      if (isPerson(data, this.appStore.tenantId())) {
        return data;
      }
    }
    return undefined;
  }
}