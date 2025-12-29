import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { OrgModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { convertFormToNewPerson, createNewPersonFormModel, PersonNewFormModel } from '@bk2/subject-person-util';

import { PersonNewFormComponent } from './person-new.form';
import { PersonNewStore } from './person-new.store';

@Component({
  selector: 'bk-person-new-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, PersonNewFormComponent,
    IonContent
  ],
  providers: [PersonNewStore],
  template: `
    <bk-header title="@subject.person.operation.create.label" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-person-new-form
        [formData]="formData()"
        [priv]="priv()"
        [membershipCategories]="mcat()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class PersonNewModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly personNewStore = inject(PersonNewStore);

  // inputs
  public org = input<OrgModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => createNewPersonFormModel(this.org()));

  // derived signals and fields
  protected priv = computed(() => this.personNewStore.privacySettings());
  protected currentUser = computed(() => this.personNewStore.currentUser());
  protected mcat = computed(() => this.personNewStore.membershipCategory());

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToNewPerson(this.formData(), this.personNewStore.tenantId()), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(createNewPersonFormModel(this.org()));  // reset the form
  }

  protected onFormDataChange(formData: PersonNewFormModel): void {
    this.formData.set(formData);
  }
}
