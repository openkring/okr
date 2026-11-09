import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { ImageConfig } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { SectionI18n } from '@okr/cms-section-util';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { ImageEditForm } from './image-edit.form';

/** Edits one image of a section. Dismisses with the edited ImageConfig and role 'confirm'. */
@Component({
  selector: 'okr-image-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ImageEditForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().image_edit_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-image-edit-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class ImageEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly image = input.required<ImageConfig>();
  public readonly readOnly = input<boolean>(true);
  public readonly i18n = input.required<SectionI18n>();

  // state
  protected readonly formData = linkedSignal(() => safeStructuredClone(this.image()));
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  protected onFormDataChange(formData: ImageConfig): void {
    this.formData.set(formData);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  /** revert to the stored image and force a fresh form (clears the Vest state) */
  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.image()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
