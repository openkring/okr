import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { LocationModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { LocationFormComponent } from '@bk2/location-ui';
import { convertFormToLocation, convertLocationToForm, LocationFormModel } from '@bk2/location-util';


@Component({
  selector: 'bk-location-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, LocationFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
    <ion-content>
      <bk-location-form
        [formData]="formData()" 
        [currentUser]="currentUser()"
        [types]="types()"
        [allTags]="tags()"
        [readOnly]="isReadOnly()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class LocationEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public location = input.required<LocationModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertLocationToForm(this.location()));

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('location', this.location().bkey, this.isReadOnly()));
  protected tags = computed(() => this.appStore.getTags('location'));
  protected types = computed(() => this.appStore.getCategory('location_type'));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToLocation(this.formData(), this.location()), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertLocationToForm(this.location()));  // reset the form
  }

  protected onFormDataChange(formData: LocationFormModel): void {
    this.formData.set(formData);
  }
}
