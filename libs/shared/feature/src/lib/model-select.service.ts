import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore, GroupSelectModal, OrgSelectModal, PersonSelectModal, ResourceSelectModal, ResponsibilitySelectModal } from "@bk2/shared-feature";
import { isLocation, isOrg, isPerson, isResource } from "@bk2/shared-util-core";
import { AvatarInfo, GroupModel, LocationModel, OrgModel, PersonModel, ResourceModel, ResponsibilityModel } from "@bk2/shared-models";
import { DEFAULT_LABEL, DEFAULT_TAGS } from "@bk2/shared-constants";

import { LocationSelectModal } from "./location-select.modal";

@Injectable({
    providedIn: 'root'
})
export class ModelSelectService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
    
/***************************  person  *************************** */
  public async selectPerson(selectedTag = DEFAULT_TAGS): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModal,
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
      component: OrgSelectModal,
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
      component: ResourceSelectModal,
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

  /***************************  location  *************************** */
  public async selectLocation(selectedTag = DEFAULT_TAGS): Promise<LocationModel | undefined> {
    const modal = await this.modalController.create({
      component: LocationSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        type: selectedTag,
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
        if (isLocation(data, this.appStore.env.tenantId)) {
            return data;
        }
    }
    return undefined;
  }

  public async selectLocationAvatar(selectedTag = DEFAULT_TAGS, label = DEFAULT_LABEL): Promise<AvatarInfo | undefined> {
    const location = await this.selectLocation(selectedTag);
    if (location) {
      return {
        key: location.bkey,
        name1: location.distance + '',  
        name2: location.name,
        label,
        modelType: 'location',
        type: location.type,
        subType: ''
      }
    }
    return undefined;
  }

  /***************************  group  *************************** */
  public async selectGroup(selectedTag = DEFAULT_TAGS): Promise<GroupModel | undefined> {
    const modal = await this.modalController.create({
      component: GroupSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag,
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      return data as GroupModel;
    }
    return undefined;
  }

  /***************************  responsibility  *************************** */
  public async selectResponsibility(): Promise<ResponsibilityModel | undefined> {
    const currentUser = this.appStore.currentUser();
    if (!currentUser) return undefined;
    const modal = await this.modalController.create({
      component: ResponsibilitySelectModal,
      cssClass: 'list-modal',
      componentProps: { currentUser },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      return data as ResponsibilityModel;
    }
    return undefined;
  }
}