import { Component, computed, effect, input, model, output } from "@angular/core";
import { form } from "@angular/forms/signals";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";

import { DiarySource, DiaryTarget, UserModel } from "@okr/shared-models";
import { Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote } from "@okr/shared-ui";
import { validateVestTree, vestErrors } from "@okr/shared-util-angular";
import { coerceBoolean, convertDateFormatToString, DateFormat } from "@okr/shared-util-core";
import { diaryTransferValidations, mergeDiaryTargets, ProfileI18n } from "@okr/profile-util";

/**
 * One diary app offered as a column. Structurally the `DiaryTenantInfo` that
 * `DiaryLineService.listMyDiaryTenants` returns — declared here so the ui lib does not depend
 * on a data-access lib.
 */
export interface DiaryTransferColumn {
  tenantId: string;
  title: string;
  travelFrom: string;
  travelTo: string;
}

/**
 * Spec 1.77 §5 — «Tagebuch-Transfer»: rows = transfer kinds (sources), columns = diary apps.
 * A ticked cell routes that source into that diary; each column carries an optional period
 * (`von`/`bis`). An empty bound inherits the diary's published travel period, shown as the
 * placeholder. No submit button: the profile page's change-confirmation saves the UserModel.
 *
 * More than four diaries: there is no generic multi-select primitive in `@okr/shared-ui`
 * (`okr-chips` only handles tag/role chips), so the grid stays and scrolls horizontally
 * inside the card instead of switching to a chip selector per row.
 */
@Component({
  selector: 'okr-profile-diary-transfer-accordion',
  standalone: true,
  imports: [
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    Checkbox, DateInput, ErrorNote,
  ],
  styles: [`
    .scroller { overflow-x: auto; }
    .scroller ion-row { flex-wrap: nowrap; }
    .scroller ion-col { min-width: 9rem; }
    .scroller ion-col.label { min-width: 8rem; display: flex; align-items: center; }
    .title { font-weight: 600; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-diary-transfer">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().diaryTransfer_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form novalidate>
          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ i18n().diaryTransfer_description() }}</ion-label>
                </ion-item>
                <okr-error-note [errors]="diaryTargetsErrors()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          <div class="scroller">
            <ion-grid>
              <!-- column headers: diary title and its period -->
              <ion-row>
                <ion-col class="label" size="auto"></ion-col>
                @for (column of columns(); track column.tenantId) {
                  <ion-col>
                    <ion-item lines="none">
                      <ion-label class="title ion-text-wrap">{{ column.title }}</ion-label>
                    </ion-item>
                    <okr-date-input [i18n]="column.fromI18n" [storeDate]="column.target.from" (storeDateChange)="onPeriodChange(column.tenantId, 'from', $event)" [readOnly]="isReadOnly()" />
                    <okr-date-input [i18n]="column.toI18n" [storeDate]="column.target.to" (storeDateChange)="onPeriodChange(column.tenantId, 'to', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="column.periodErrors" />
                  </ion-col>
                }
              </ion-row>
              <!-- one row per transfer kind, one checkbox per diary -->
              @for (source of sources(); track source) {
                <ion-row>
                  <ion-col class="label" size="auto">
                    <ion-label class="ion-text-wrap">{{ sourceLabel(source) }}</ion-label>
                  </ion-col>
                  @for (column of columns(); track column.tenantId) {
                    <ion-col>
                      <okr-checkbox [i18n]="checkboxI18n(column.tenantId, source)" [checked]="column.target.sources.includes(source)" (checkedChange)="onSourceChange(column.tenantId, source, $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                  }
                </ion-row>
              }
            </ion-grid>
          </div>
        </form>
      }
    </div>
  </ion-accordion>
  `,
})
export class ProfileDiaryTransferAccordion {
  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public formData = model.required<UserModel>();
  public readonly diaries = input.required<DiaryTransferColumn[]>();
  public readonly sources = input.required<DiarySource[]>();
  public readonly showForm = input<boolean>(true);   // toggled by the parent to reset the form
  public readonly color = input('primary');          // color of the accordion header
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // One target per offered diary, derived from formData. A pure mirror: every edit goes through
  // applyTargets into formData, and mergeDiaryTargets is idempotent, so nothing local can be lost.
  protected readonly targets = computed(() => this.mergeTargets(this.formData()));

  // The suite validates the merged targets, not the UserModel — targets() is a computed and cannot
  // back a signal form, so the form wraps formData and the closure derives the same targets.
  private readonly suiteWithContext = (model: UserModel) =>
    diaryTransferValidations(this.mergeTargets(model));
  protected readonly diaryTransferForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.diaryTransferForm);
  protected readonly diaryTargetsErrors = computed(() => this.validationResult().getErrors('diaryTargets'));

  protected readonly columns = computed(() => {
    const targets = this.targets();
    const result = this.validationResult();
    return this.diaries().map((diary, i) => ({
      tenantId: diary.tenantId,
      title: diary.title,
      target: targets[i],
      fromI18n: this.dateI18n(`${diary.tenantId}.from`, this.i18n().diaryTransfer_from(), diary.travelFrom),
      toI18n: this.dateI18n(`${diary.tenantId}.to`, this.i18n().diaryTransfer_to(), diary.travelTo),
      periodErrors: result.getErrors(`${diary.tenantId}.period`),
    }));
  });

  constructor() {
    effect(() => this.valid.emit(this.diaryTransferForm().valid()));
  }

  /******************************* actions *************************************** */
  protected onPeriodChange(tenantId: string, bound: 'from' | 'to', value: string): void {
    const storeDate = value ?? '';
    const current = this.targets().find((t) => t.tenantId === tenantId);
    if (!current || current[bound] === storeDate) return;
    this.applyTargets(this.targets().map((t) => t.tenantId === tenantId ? { ...t, [bound]: storeDate } : t));
  }

  protected onSourceChange(tenantId: string, source: DiarySource, checked: boolean): void {
    const current = this.targets().find((t) => t.tenantId === tenantId);
    if (!current || current.sources.includes(source) === checked) return;
    this.applyTargets(this.targets().map((t) => {
      if (t.tenantId !== tenantId) return t;
      const sources = checked ? [...t.sources, source] : t.sources.filter((s) => s !== source);
      return { ...t, sources };
    }));
  }

  private applyTargets(newTargets: DiaryTarget[]): void {
    this.dirty.emit(true);
    this.formData.update((u) => ({ ...u, diaryTargets: newTargets }));
  }

  /******************************* helpers *************************************** */
  private mergeTargets(user: UserModel): DiaryTarget[] {
    return mergeDiaryTargets(user.diaryTargets ?? [], this.diaries().map((d) => d.tenantId));
  }

  protected sourceLabel(source: DiarySource): string {
    switch (source) {
      case 'taskDone': return this.i18n().diaryTransfer_source_taskDone();
      case 'jasstafel': return this.i18n().diaryTransfer_source_jasstafel();
      default: return source;
    }
  }

  protected checkboxI18n(tenantId: string, source: DiarySource): CheckboxI18n {
    return { name: `${tenantId}.${source}`, label: '', helper: '' };
  }

  /** An empty bound shows the diary's travel date as placeholder, e.g. «1.10.2026 (Reise)». */
  private dateI18n(name: string, label: string, travelDate: string): DateInputI18n {
    const view = travelDate ? convertDateFormatToString(travelDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
    return {
      name,
      label,
      placeholder: view ? `${view} (${this.i18n().diaryTransfer_travel()})` : '',
    };
  }
}
