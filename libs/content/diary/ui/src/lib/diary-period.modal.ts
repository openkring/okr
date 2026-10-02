import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { DiaryPeriod } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { DiaryI18n } from '@okr/content-diary-util';

import { DiaryPeriodForm } from './diary-period.form';

/**
 * Admin-only container for the travel period form — header, change-confirmation, one form.
 * Nothing else (spec 1.77 D7, building-forms skill).
 *
 * Does NOT save itself: the caller (`DiaryStore.editPeriod()`) gets the edited period back via
 * `dismiss(..., 'confirm')` and calls `AppConfigService.setTravelPeriod`. The store passes its
 * resolved `i18n` in (like `DiaryEditModal`), so this modal injects no store or service — the
 * store's dynamic `import('@okr/content-diary-ui')` must not become circular.
 */
@Component({
  selector: 'okr-diary-period-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, DiaryPeriodForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-diary-period-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class DiaryPeriodModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly period = input.required<DiaryPeriod>();
  public readonly i18n = input.required<DiaryI18n>();

  // signals
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.period()) as DiaryPeriod);

  protected readonly headerTitle = computed(() => this.i18n().period_title());
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  protected onFormDataChange(formData: DiaryPeriod): void {
    this.formData.set(formData);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.period()) as DiaryPeriod);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
