import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { PersonalRelNewFormComponent } from '@bk2/relationship-personal-rel-ui';
import { convertPersonsToNewForm, PersonalRelNewFormModel } from '@bk2/relationship-personal-rel-util';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import {  PersonModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { PersonalRelModalsService } from './personal-rel-modals.service';

@Component({
  selector: 'bk-personal-rel-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, PersonalRelNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@personalRel.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-personal-rel-new-form
        [formData]="formData()"
        [currentUser]="currentUser()" 
        [types]="types()"
        [allTags]="allTags()"
        [readOnly]="readOnly()"
        (selectPerson)="selectPerson($event)"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class PersonalRelNewModalComponent {
  private readonly personalRelModalsService = inject(PersonalRelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public subject = input.required<PersonModel>();
  public object = input.required<PersonModel>(); 
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(true); // new form is prefilled and valid
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertPersonsToNewForm(this.subject(), this.object(), this.currentUser()));

  // derived signals
  protected allTags = computed(() => this.appStore.getTags('personalrel'));
  protected types = computed(() => this.appStore.getCategory('personalrel_type'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertPersonsToNewForm(this.subject(), this.object(), this.currentUser()));  // reset the form
  }

  protected onFormDataChange(formData: PersonalRelNewFormModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(isSubject: boolean): Promise<void> {
    const person = await this.personalRelModalsService.selectPerson();
    if (!person) return;
    if (isSubject) {
      this.formData.update((vm) => ({
        ...vm, 
        subjectKey: person.bkey, 
        subjectFirstName: person.firstName,
        subjectLastName: person.lastName,
        subjectGender: person.gender,
      }));
    } else {
      this.formData.update((vm) => ({
        ...vm, 
        objectKey: person.bkey, 
        objectFirstName: person.firstName,
        objectLastName: person.lastName,
        objectGender: person.gender,
      }));
    }
  }
}
