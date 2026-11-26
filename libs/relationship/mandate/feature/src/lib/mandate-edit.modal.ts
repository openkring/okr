import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, ToastController } from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, MandateModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, showToast } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { MandateService } from '@okr/relationship-mandate-data-access';
import { MandateForm } from '@okr/relationship-mandate-ui';
import { MANDATE_I18N_KEYS, MandateI18n } from '@okr/relationship-mandate-util';

/**
 * Gives a new family Vollmacht (spec 1.180 §5.1). Saves it itself through `MandateService.create` and dismisses with
 * the new okey and role 'confirm'; a failed write keeps the modal open. Lives in the feature lib because it injects
 * the data-access service. No store is injected here — `MandateStore` opens this modal, importing it back would be
 * circular.
 */
@Component({
  selector: 'okr-mandate-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, MandateForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.create() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-mandate-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [existing]="existing()"
          [suggestions]="suggestions()"
          [readOnly]="isSaving()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class MandateEditModal {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);
  private readonly mandateService = inject(MandateService);
  protected readonly i18n = inject(I18nService).translateAll(MANDATE_I18N_KEYS) as MandateI18n;

  // inputs
  public readonly mandate = input.required<MandateModel>();
  /** the grantor's stored Vollmachten, for the duplicate check */
  public readonly existing = input<MandateModel[]>([]);
  /** household members and related persons, offered first in the form */
  public readonly suggestions = input<AvatarInfo[]>([]);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.mandate()));
  protected showForm = signal(true);
  protected isSaving = signal(false);

  // derived
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isSaving());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.create() } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const currentUser = this.appStore.currentUser();
    const mandate = this.formData();
    if (!currentUser || !mandate || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      const okey = await this.mandateService.create(mandate, currentUser);
      if (!okey) {
        await showToast(this.toastController, MANDATE_I18N_KEYS.save_error);
        return;
      }
      await showToast(this.toastController, MANDATE_I18N_KEYS.save_conf);
      await dismissOverlay(this.modalController, okey, 'confirm');
    } catch (error) {
      console.error('MandateEditModal.save:', error);
      await showToast(this.toastController, MANDATE_I18N_KEYS.save_error);
    } finally {
      this.isSaving.set(false);
    }
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.mandate()));
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MandateModel): void {
    this.formData.set(formData);
  }
}
