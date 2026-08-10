import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';
import { TagStringFormData } from '@okr/aoc-util';

import { TagStringForm } from './tag-string.form';

/**
 * Edit one tag string of a tag definition together with its labels for the current tenant.
 * Standard edit-modal structure: header + change-confirmation (shown only when the form is
 * valid AND dirty) + content. No submit button — the parent store persists what `save()` returns.
 */
@Component({
  selector: 'okr-tag-string-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    TagStringForm,
    IonContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-tag-string-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [showLabels]="showLabels()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class TagStringEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public tagString = input.required<TagStringFormData>();
  public showLabels = input(true);
  public title = input('');
  public okLabel = input('OK');
  public cancelLabel = input('Cancel');

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.cancelLabel(), save: this.okLabel() } as ChangeConfirmationI18n));

  protected formData = linkedSignal(() => safeStructuredClone(this.tagString()));
  protected showForm = signal(true);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.tagString()));  // reset the form
    // destroy and recreate the form so Vest state is fully reset
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: TagStringFormData): void {
    this.formData.set(formData);
  }
}
