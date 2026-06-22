import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { LocationModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { LocationForm } from '@bk2/location-ui';
import { LocationStore } from './location.store';


@Component({
  selector: 'bk-location-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, LocationForm,
    IonContent
  ],
  providers: [LocationStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
      }
    <ion-content>
      @if(formData(); as formData) {
        <bk-location-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [types]="types()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          [i18n]="store.i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class LocationEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(LocationStore);

  // inputs
  public location = input.required<LocationModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.location()));
  protected showForm = signal(true);

  // derived
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.location().bkey));
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.getTypes());
  protected tenantId = computed(() => this.store.tenantId());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.location()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: LocationModel): void {
    this.formData.set(formData);
  }
}
