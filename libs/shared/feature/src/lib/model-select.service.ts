import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore, GroupSelectModal, OrgSelectModal, PersonSelectModal, ResourceSelectModal, ResponsibilitySelectModal } from "@okr/shared-feature";
import { isLocation, isOrg, isPerson, isResource } from "@okr/shared-util-core";
import { AvatarInfo, GroupModel, LocationModel, OrgModel, PersonModel, ResourceModel, ResponsibilityModel } from "@okr/shared-models";
import { DEFAULT_LABEL, DEFAULT_TAGS } from "@okr/shared-constants";

import { LocationSelectModal, LocationSelectResult } from "./location-select.modal";
import { PersonSelectResult } from "./person-select.modal";
import { ResourceSelectResult } from "./resource-select.modal";
import { normalizeWhitespace } from "./location-select.store";

/**
 * Narrows who the person picker offers. Both are opt-in: without them the picker behaves as before.
 */
export type PersonSelectOptions = {
  /**
   * Tenant id: two-level lookup — persons holding an app account in THAT tenant first, everybody
   * else below a divider (the invite path). A tenant rather than a boolean because an account
   * belongs to exactly one tenant.
   */
  accountsFirst?: string;
  /** okeys never offered, e.g. those the caller has already picked. */
  excludeKeys?: string[];
};

@Injectable({
    providedIn: 'root'
})
export class ModelSelectService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
    
/***************************  person  *************************** */
  /**
   * Opens the person-select modal. When allowCustom is true and the user types a name that
   * matches no existing person, the modal offers a custom entry (returned as kind: 'custom').
   */
  private async openPersonSelect(selectedTag = DEFAULT_TAGS, allowCustom = false, membersFirst = false, options: PersonSelectOptions = {}): Promise<PersonSelectResult | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag,
        currentUser: this.appStore.currentUser(),
        allowCustom,
        membersFirst,
        accountsFirst: options.accountsFirst ?? '',
        excludeKeys: options.excludeKeys ?? [],
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss<PersonSelectResult>();
    if (role === 'confirm' && data) {
      return data;
    }
    return undefined;
  }

  public async selectPerson(selectedTag = DEFAULT_TAGS): Promise<PersonModel | undefined> {
    const result = await this.openPersonSelect(selectedTag);
    if (result?.kind === 'predefined' && isPerson(result.person, this.appStore.env.tenantId)) {
      return result.person;
    }
    return undefined;
  }

  /**
   * Returns an AvatarInfo for the selected person. When allowCustom is true and the user enters
   * a name that matches no existing person, a custom avatar (key '') with that name is returned.
   */
  public async selectPersonAvatar(selectedTag = DEFAULT_TAGS, label = DEFAULT_LABEL, allowCustom = false, membersFirst = false, options: PersonSelectOptions = {}): Promise<AvatarInfo | undefined> {
    const result = await this.openPersonSelect(selectedTag, allowCustom, membersFirst, options);
    if (!result) return undefined;
    if (result.kind === 'custom') {
      const parts = normalizeWhitespace(result.label).split(' ');
      const name1 = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
      const name2 = parts[parts.length - 1] ?? result.label;
      return {
        key: '',
        name1,
        name2,
        label,
        modelType: 'person',
        type: '',
        subType: ''
      }
    }
    const person = result.person;
    return {
      key: person.okey,
      name1: person.firstName,
      name2: person.lastName,
      label,
      modelType: 'person',
      type: person.gender,
      subType: ''
    }
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
        key: org.okey,
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
  /**
   * Opens the resource-select modal. With allowCustom the modal also offers the typed term when it
   * matches no resource; that answer comes back as { kind: 'custom' } instead of a model, so a
   * caller that does not ask for it keeps seeing resources only.
   */
  private async openResourceSelect(selectedTag: string, title: string | undefined, allowCustom: boolean): Promise<ResourceModel | ResourceSelectResult | undefined> {
    const modal = await this.modalController.create({
      component: ResourceSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag,
        title,
        allowCustom,
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss<ResourceModel | ResourceSelectResult>();
    if (role === 'confirm' && data) {
      if (isResource(data, this.appStore.env.tenantId)) return data;
      if ((data as ResourceSelectResult).kind === 'custom') return data as ResourceSelectResult;
    }
    return undefined;
  }

  public async selectResource(selectedTag = DEFAULT_TAGS, title?: string): Promise<ResourceModel | undefined> {
    const result = await this.openResourceSelect(selectedTag, title, false);
    return isResource(result, this.appStore.env.tenantId) ? result : undefined;
  }

  /**
   * Returns an AvatarInfo for the selected resource. When allowCustom is true and the user enters a
   * name that matches no resource, a custom avatar (key '') carrying that name is returned — the
   * Logbuch needs it for a boat that is not (yet) in the inventory.
   */
  public async selectResourceAvatar(selectedTag = DEFAULT_TAGS, label = DEFAULT_LABEL, title?: string, allowCustom = false): Promise<AvatarInfo | undefined> {
    const result = await this.openResourceSelect(selectedTag, title, allowCustom);
    if (!result) return undefined;
    if (!isResource(result, this.appStore.env.tenantId)) {
      return {
        key: '',
        name1: '',
        name2: (result as ResourceSelectResult).label,
        label,
        modelType: 'resource',
        type: '',
        subType: '',
      }
    }
    return {
      key: result.okey,
      name1: '',
      name2: result.name,
      label,
      modelType: 'resource',
      type: result.type,
      subType: result.subType,
    }
  }

  /***************************  location  *************************** */
  public async selectLocation(type = '', showMap = true, allowCustom = true): Promise<LocationSelectResult | undefined> {
    const modal = await this.modalController.create({
      component: LocationSelectModal,
      cssClass: 'map-modal',
      componentProps: {
        type,
        showMap,
        currentUser: this.appStore.currentUser(),
        allowCustom,
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss<LocationSelectResult>();
    if (role === 'confirm' && data) {
      return data;
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