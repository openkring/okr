import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, OrgModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { OrgSelectModal } from '@okr/shared-feature';
import { isOrg } from '@okr/shared-util-core';

import { createNewPersonFormModel, PersonNewFormModel } from '@okr/subject-person-util';
import { PersonNewForm } from '@okr/subject-person-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { PersonStore } from './person.store';

@Component({
  selector: 'okr-person-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, PersonNewForm,
    IonContent
  ],
  providers: [PersonStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.create()}" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <okr-person-new-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [genders]="genders()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="false"
          [personLookupEnabled]="personLookupEnabled()"
          [membershipCategories]="mcat()"
          [membershipEnabled]="membershipEnabled()"
          (selectClicked)="selectOrg()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
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
  // A tenant without a membership category (no 'mcat' doc for this tenant) must still be able
  // to create persons: fall back to an empty category and hide the optional membership card.
  protected mcat = computed(() => this.store.membershipCategory() ?? new CategoryListModel(this.tenantId()));
  protected membershipEnabled = computed(() => (this.store.membershipCategory()?.items.length ?? 0) > 0);
  protected tags = computed(() => this.store.getTags());
  protected tenantId = computed(() => this.store.tenantId());
  protected genders = computed(() => this.store.appStore.getCategory('gender'));
  protected personLookupEnabled = computed(() => this.store.appStore.appConfig().personLookupEnabled ?? false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => this.store.setOrgId(this.org()?.okey));
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
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
        this.store.setOrgId(data.okey); // Use newly selected org
        this.formData.update((vm) => ({
          ...vm,
          orgKey: data.okey,
          orgName: data.name,
        }));
      }
    }
  }
}
