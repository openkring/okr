import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';

import { TASK_ARCHIVE_DAYS_MAX, TASK_ARCHIVE_DAYS_MIN, TaskI18n, TaskSettings, taskSettingsValidations } from '@okr/task-util';

/**
 * Admin-only settings form (spec 1.72 §8.2/§9): two `AppConfig` fields, not a Firestore model —
 * no `okey`/`tenants`/`tags`, no chips/notes. `taskDiaryTenantId` selects among the tenants this
 * operator runs (an empty option means "no diary entry"); membership in that list is enforced by
 * the select itself, so the Vest suite carries no length cap on the field (building-forms rule 1).
 */
@Component({
  selector: 'okr-task-settings-form',
  standalone: true,
  imports: [ErrorNote, NumberInput, StringSelect, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
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
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="taskDiaryTenantIdI18n()"
                    [selectedString]="taskDiaryTenantId()"
                    (selectedStringChange)="onFieldChange('taskDiaryTenantId', $event)"
                    [stringList]="tenantIdOptions()" [labels]="tenantIdLabels()" [readOnly]="false" />
                  <okr-error-note [errors]="taskDiaryTenantIdErrors()" />
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
  /** every tenant id this operator runs (`AppConfigService.list()` okeys); '' is added by this form as "no diary" */
  public readonly tenantIds = input<string[]>([]);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly settingsForm = form(this.formData, (path) =>
    validateVestTree(path, taskSettingsValidations as any));

  private readonly validationResult = computed(() => taskSettingsValidations(this.formData()));
  protected taskArchiveDaysErrors = computed(() => this.validationResult().getErrors('taskArchiveDays'));
  protected taskDiaryTenantIdErrors = computed(() => this.validationResult().getErrors('taskDiaryTenantId'));

  constructor() {
    effect(() => this.valid.emit(this.settingsForm().valid()));
  }

  // computed field accessors
  protected readonly taskArchiveDays = computed(() => this.formData()?.taskArchiveDays ?? 30);
  protected readonly taskDiaryTenantId = computed(() => this.formData()?.taskDiaryTenantId ?? '');
  // '' (no diary) always first, then every known tenant id
  protected readonly tenantIdOptions = computed(() => ['', ...this.tenantIds()]);
  protected readonly tenantIdLabels = computed(() => ['', ...this.tenantIds()].map(
    (id, i) => i === 0 ? this.i18n().settings_taskDiaryTenantId_none() : id));

  protected taskArchiveDaysI18n = computed(() => ({
    name: 'taskArchiveDays',
    label: this.i18n().settings_taskArchiveDays_label(),
    placeholder: '',
    helper: this.i18n().settings_taskArchiveDays_helper(),
  } as NumberInputI18n));

  protected taskDiaryTenantIdI18n = computed(() => ({
    name: 'taskDiaryTenantId',
    label: this.i18n().settings_taskDiaryTenantId_label(),
    helper: this.i18n().settings_taskDiaryTenantId_helper(),
  } as StringSelectI18n));

  protected onFieldChange(fieldName: keyof TaskSettings, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
