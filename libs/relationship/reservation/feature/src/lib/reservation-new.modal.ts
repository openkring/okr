import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { convertReserverAndResourceToNewForm, ReservationNewFormModel } from '@bk2/relationship-reservation-util';

import { ReservationNewFormComponent } from './reservation-new.form';

@Component({
  selector: 'bk-reservation-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ReservationNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@reservation.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      <bk-reservation-new-form
        [formData]="formData()"
        [readOnly]="readOnly()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class ReservationNewModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public reserver = input.required<PersonModel | OrgModel>();
  public resource = input.required<ResourceModel>(); 
  public modelType = input.required<string>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertReserverAndResourceToNewForm(this.reserver(), this.resource(), this.currentUser(), this.modelType()));

  // derived signals
  public currentUser = computed(() => this.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertReserverAndResourceToNewForm(this.reserver(), this.resource(), this.currentUser(), this.modelType()));  // reset the form
  }

  protected onFormDataChange(formData: ReservationNewFormModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
