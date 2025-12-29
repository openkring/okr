import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent, ResourceSelectModalComponent } from "@bk2/shared-feature";
import { isOrg, isPerson, isResource } from "@bk2/shared-util-core";
import { AvatarInfo, OrgModel, PersonModel, ResourceModel } from "@bk2/shared-models";
import { DEFAULT_LABEL, DEFAULT_TAGS } from "@bk2/shared-constants";



@Injectable({
    providedIn: 'root'
})
export class ModelSelectService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
    
/***************************  person  *************************** */
  public async selectPerson(selectedTag = DEFAULT_TAGS): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
        if (isPerson(data, this.appStore.env.tenantId)) {
            return data;
        }
    }
    return undefined;
  }

  public async selectPersonAvatar(selectedTag = DEFAULT_TAGS, label = DEFAULT_LABEL): Promise<AvatarInfo | undefined> {
    const person = await this.selectPerson(selectedTag);
    if (person) {
      return {
        key: person.bkey,
        name1: person.firstName,
        name2: person.lastName,
        label,
        modelType: 'person',
        type: person.gender,
        subType: ''
      }
    }
    return undefined;
  }

/***************************  org  *************************** */
  public async selectOrg(selectedTag = DEFAULT_TAGS): Promise<OrgModel | undefined> {
    const modal = await this.modalController.create({
      component: OrgSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag,
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
        if (isOrg(data, this.appStore.env.tenantId)) {
            return data;
        }
    }
    return undefined;
  }

  public async selectOrgAvatar(selectedTag = DEFAULT_TAGS, label = DEFAULT_LABEL): Promise<AvatarInfo | undefined> {
    const org = await this.selectOrg(selectedTag);
    if (org) {
      return {
        key: org.bkey,
        name1: '',
        name2: org.name,
        label,
        modelType: 'org',
        type: org.type,
        subType: ''
      }
    }
    return undefined;
  }

/***************************  resource  *************************** */
  public async selectResource(selectedTag = DEFAULT_TAGS): Promise<ResourceModel | undefined> {
    const modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag,
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
        if (isResource(data, this.appStore.env.tenantId)) {
            return data;
        }
    }
    return undefined;
  }

  public async selectResourceAvatar(selectedTag = DEFAULT_TAGS, label = DEFAULT_LABEL): Promise<AvatarInfo | undefined> {
    const resource = await this.selectResource(selectedTag);
    if (resource) {
      return {
        key: resource.bkey,
        name1: '',
        name2: resource.name,
        label,
        modelType: 'resource',
        type: resource.type,
        subType: resource.subType,
      }
    }
    return undefined;
  }
}