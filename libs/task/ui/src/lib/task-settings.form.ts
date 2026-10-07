import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ErrorNote, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import { TASK_ARCHIVE_DAYS_MAX, TASK_ARCHIVE_DAYS_MIN, TaskI18n, TaskSettings, taskSettingsValidations } from '@okr/task-util';

/**
 * Admin-only settings form (spec 1.72 §8.2/§9): the `AppConfig` task settings, not a Firestore
 * model — no `okey`/`tenants`/`tags`, no chips/notes. (The diary tenant is chosen per user, spec 1.77.)
 */
@Component({
  selector: 'okr-task-settings-form',
  standalone: true,
  imports: [ErrorNote, NumberInput, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="taskArchiveDaysI18n()" [value]="taskArchiveDays()"
                    (valueChange)="onFieldChange('taskArchiveDays', $event)"
                    [autofocus]="true" [integer]="true" [min]="taskArchiveDaysMin" [max]="taskArchiveDaysMax"
                    [showHelper]="true" [readOnly]="false" />
                  <okr-error-note [errors]="taskArchiveDaysErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class TaskSettingsForm {
  /** bound to the Vest suite's own constants (building-forms rule 2) — never a copied literal */
  protected readonly taskArchiveDaysMin = TASK_ARCHIVE_DAYS_MIN;
  protected readonly taskArchiveDaysMax = TASK_ARCHIVE_DAYS_MAX;

  // inputs
  public readonly i18n = input.required<TaskI18n>();
  public formData = model.required<TaskSettings>();
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly settingsForm = form(this.formData, (path) =>
    validateVestTree(path, taskSettingsValidations as any));

  private readonly validationResult = vestErrors(this.settingsForm);
  protected taskArchiveDaysErrors = computed(() => this.validationResult().getErrors('taskArchiveDays'));

  constructor() {
    effect(() => this.valid.emit(this.settingsForm().valid()));
  }

  // computed field accessors
  protected readonly taskArchiveDays = computed(() => this.formData()?.taskArchiveDays ?? 30);

  protected taskArchiveDaysI18n = computed(() => ({
    name: 'taskArchiveDays',
    label: this.i18n().settings_taskArchiveDays_label(),
    placeholder: '',
    helper: this.i18n().settings_taskArchiveDays_helper(),
  } as NumberInputI18n));

  protected onFieldChange(fieldName: keyof TaskSettings, fieldValue: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
