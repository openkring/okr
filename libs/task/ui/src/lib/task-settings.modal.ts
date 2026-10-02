import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { TASK_I18N_KEYS, TaskI18n, TaskSettings } from '@okr/task-util';

import { TaskSettingsForm } from './task-settings.form';

/**
 * Admin-only container for the task settings form — header, change-confirmation, one form.
 * Nothing else (spec 1.72 §8.2/§9, building-forms skill).
 *
 * Does NOT save itself: the caller (`TaskStore.editSettings()`) gets the edited settings back
 * via `dismiss(..., 'confirm')` and calls `AppConfigService.setTaskSettings`. This modal
 * therefore injects no store and needs no `providers` array — a feature store must never be
 * imported here, or the store's dynamic `import('./task-settings.modal')` becomes circular.
 */
@Component({
  selector: 'okr-task-settings-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, TaskSettingsForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-task-settings-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class TaskSettingsModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(TASK_I18N_KEYS) as TaskI18n;

  // inputs
  public readonly settings = input.required<TaskSettings>();

  // signals
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.settings()));

  protected readonly headerTitle = computed(() => this.i18n.settings_title());
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  protected onFormDataChange(formData: TaskSettings): void {
    this.formData.set(formData);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.settings()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
