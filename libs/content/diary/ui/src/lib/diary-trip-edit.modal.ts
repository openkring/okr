import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { TripModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { DiaryI18n } from '@okr/content-diary-util';
import { DiaryTripForm } from './diary-trip.form';

@Component({
  selector: 'okr-diary-trip-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, DiaryTripForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-diary-trip-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class DiaryTripEditModal {
  private readonly modalController = inject(ModalController);

  // inputs — no store injected
  public readonly trip = input.required<TripModel>();
  public readonly isNew = input(false);
  public readonly i18n = input.required<DiaryI18n>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.trip()) as TripModel);
  protected showForm = signal(true);

  protected readonly headerTitle = computed(() => (this.isNew() ? this.i18n().albums_trip_add() : this.i18n().albums_trip_edit()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(), save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.trip()) as TripModel);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: TripModel): void {
    this.formData.set(formData);
  }
}
