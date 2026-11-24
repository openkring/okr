import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { CategoryI18n, CategoryItemLabel } from '@okr/category-util';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill, safeStructuredClone } from '@okr/shared-util-core';

import { CategoryItemLabelForm } from './category-item-label.form';

/** Asks for the label of an item just added to a translated list. The opener stores what it returns. */
@Component({
  selector: 'okr-category-item-label-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CategoryItemLabelForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-category-item-label-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class CategoryItemLabelModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public label = input.required<CategoryItemLabel>();
  public itemName = input.required<string>();
  public i18n = input.required<CategoryI18n>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.label()));
  protected showForm = signal(true);
  protected readonly title = computed(() => fill(this.i18n().item_label_title(), { name: this.itemName() }));
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n().cancel(), save: this.i18n().save() } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.label()));
    // re-mount the form so its field state starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CategoryItemLabel): void {
    this.formData.set(formData);
  }
}
