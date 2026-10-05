import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { Field } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';
import { FormI18n } from '@okr/forms-util';

import { FieldConfigForm } from './field-config.form';

/** Edits one form-builder field. Dismisses with the edited field and role 'confirm'. */
@Component({
  selector: 'okr-field-config-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, FieldConfigForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().field_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-field-config-form
        [formData]="formData()"
        (formDataChange)="formData.set($event)"
        [i18n]="i18n()"
        [categoryNames]="categoryNames()"
        [readOnly]="false"
        [showForm]="showForm()"
        (dirty)="formDirty.set($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `,
})
export class FieldConfigModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly field = input.required<Field>();
  public readonly i18n = input.required<FormI18n>();
  public readonly categoryNames = input<string[]>([]);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => this.cloneField());
  protected showForm = signal(true);

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n().discard(), save: this.i18n().field_apply(),
  }));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.cloneField());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  // a category field must carry its categoryName key, else the Vest error has no form node to land on;
  // a paragraph gets its defaults (indented, small) spelled out
  private cloneField(): Field {
    const clone = safeStructuredClone(this.field()) ?? this.field();
    if (clone.type === 'category') return { ...clone, categoryName: clone.categoryName ?? '' };
    if (clone.type === 'paragraph') return { ...clone, isIndented: clone.isIndented ?? true, isSmall: clone.isSmall ?? true };
    return clone;
  }
}
