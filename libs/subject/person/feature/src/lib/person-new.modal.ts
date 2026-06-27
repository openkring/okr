import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { OrgModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { OrgSelectModal } from '@bk2/shared-feature';
import { isOrg } from '@bk2/shared-util-core';

import { createNewPersonFormModel, PersonNewFormModel } from '@bk2/subject-person-util';
import { PersonNewForm } from '@bk2/subject-person-ui';

import { PersonStore } from './person.store';

@Component({
  selector: 'bk-person-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, PersonNewForm,
    IonContent
  ],
  providers: [PersonStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.create()}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(mcat(); as mcat) {
        @if(formData(); as formData) {
          <bk-person-new-form
            [i18n]="store.i18n"
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser()"
            [genders]="genders()"
            [allTags]="tags()"
            [tenantId]="tenantId()"
            [readOnly]="false"
            [membershipCategories]="mcat"
            (selectClicked)="selectOrg()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class PersonNewModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(PersonStore);

  // inputs
  public org = input.required<OrgModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => createNewPersonFormModel(this.org()));

  // derived 
  protected currentUser = computed(() => this.store.currentUser());
  protected mcat = computed(() => this.store.membershipCategory());
  protected tags = computed(() => this.store.getTags());
  protected tenantId = computed(() => this.store.tenantId());
  protected genders = computed(() => this.store.appStore.getCategory('gender'));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => this.store.setOrgId(this.org()?.bkey));
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(createNewPersonFormModel(this.org()));  // reset the form
  }

  protected onFormDataChange(formData: PersonNewFormModel): void {
    this.formData.set(formData);
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: 'selectable',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.tenantId())) {
        this.store.setOrgId(data.bkey); // Use newly selected org
        this.formData.update((vm) => ({
          ...vm,
          orgKey: data.bkey,
          orgName: data.name,
        }));
      }
    }
  }
}
