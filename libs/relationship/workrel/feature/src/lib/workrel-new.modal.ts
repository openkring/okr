import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { WorkrelNewFormComponent } from '@bk2/relationship-workrel-ui';
import { convertPersonAndOrgToNewForm, WorkrelNewFormModel } from '@bk2/relationship-workrel-util';
import { WorkrelModalsService } from './workrel-modals.service';

@Component({
  selector: 'bk-workrel-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, WorkrelNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@workrel.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      <bk-workrel-new-form
        [formData]="formData()"
        [currentUser]="currentUser()" 
        [allTags]="tags()" 
        [types]="types()" 
        [states]="states()"
        [readOnly]="readOnly()"
        [periodicities]="periodicities()" 
        (selectPerson)="selectPerson()"
        (selectOrg)="selectOrg()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class WorkrelNewModalComponent {
  private readonly workrelModalsService = inject(WorkrelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public subject = input.required<PersonModel>();
  public object = input.required<OrgModel>(); 
  public currentUser = input<UserModel | undefined>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(true); // form is prefilled, so valid
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertPersonAndOrgToNewForm(this.subject(), this.object(), this.currentUser()));

  // derived signals
  protected tags = computed(() => this.appStore.getTags('workrel'));
  protected types = computed(() => this.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.appStore.getCategory('workrel_state'));
  protected periodicities = computed(() => this.appStore.getCategory('periodicity'));
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertPersonAndOrgToNewForm(this.subject(), this.object(), this.currentUser()));  // reset the form
  }

  protected onFormDataChange(formData: WorkrelNewFormModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const person = await this.workrelModalsService.selectPerson();
    if (!person) return;
    this.formData.update((vm) => ({
      ...vm, 
      subjectKey: person.bkey, 
      subjectName1: person.firstName,
      subjectName2: person.lastName,
      subjectType: person.gender,
    }));
  }

  protected async selectOrg(): Promise<void> {
    const org = await this.workrelModalsService.selectOrg();
    if (!org) return;
    this.formData.update((vm) => ({
      ...vm, 
      objectKey: org.bkey, 
      objectName: org.name,
      objectType: org.type,
    }));
  }
}
