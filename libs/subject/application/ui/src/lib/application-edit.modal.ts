import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ApplicationModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { ApplicationI18n } from '@okr/application-util';

import { ApplicationForm } from './application.form';

/**
 * Edits an application; dismisses with the edited ApplicationModel and role 'confirm' (the store saves it).
 * Accepting / denying is a workflow action and lives in the application list's ActionSheet.
 * A closed application (state 'closed.*') is shown read-only.
 */
@Component({
  selector: 'okr-application-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ApplicationForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().update_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-application-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()"
          [readOnly]="isTerminal()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class ApplicationEditModal {
  private readonly modalController = inject(ModalController);

  public readonly application = input.required<ApplicationModel>();
  public readonly currentUser = input<UserModel>();
  public readonly i18n        = input.required<ApplicationI18n>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.application()));
  protected showForm = signal(true);

  protected isTerminal = computed(() => (this.application().state ?? '').startsWith('closed.'));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isTerminal());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().update_save_label(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.application()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: ApplicationModel): void {
    this.formData.set(formData);
  }
}
