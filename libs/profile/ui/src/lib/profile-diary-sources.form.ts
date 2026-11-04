import { Component, computed, effect, input, model, output } from "@angular/core";
import { form } from "@angular/forms/signals";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from "@ionic/angular";

import { consentState } from "@okr/content-diary-util";
import { DIARY_SOURCES, DiaryPull, DiarySource, DiarySourceModel } from "@okr/shared-models";
import { Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote } from "@okr/shared-ui";
import { validateVestTree, vestErrors } from "@okr/shared-util-angular";
import { coerceBoolean } from "@okr/shared-util-core";
import { diarySourcesValidations, ProfileI18n } from "@okr/profile-util";

/**
 * One source app offered as a column. Structurally the `DiaryPullColumn` that
 * `DiaryLineService.listMyDiaryPullOptions` returns — declared here so the ui lib does not depend on a data-access lib.
 */
export interface DiarySourceColumn {
  tenantId: string;
  title: string;
  sources: DiarySource[];
  consented: DiarySource[];
  own: boolean;
}

/**
 * Spec 1.77 §12.4 — «Tagebuch-Quellen», in the diary app: rows = transfer kinds, columns = the person's apps. A ticked
 * cell is the request; the source app finds it when its profile opens. One period for the whole diary. No submit
 * button: the profile page's change-confirmation saves the doc.
 *
 * More than four apps: the grid stays and scrolls horizontally inside the card, as «Tagebuch-Transfer» did (D2).
 */
@Component({
  selector: 'okr-profile-diary-sources-accordion',
  standalone: true,
  imports: [
    IonAccordion, IonItem, IonLabel, IonNote, IonGrid, IonRow, IonCol,
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
  <ion-accordion toggle-icon-slot="start" value="profile-diary-sources">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().diarySources_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form novalidate>
          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label class="ion-text-wrap">{{ i18n().diarySources_description() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="fromI18n()" [storeDate]="formData().from" (storeDateChange)="onPeriodChange('from', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="toI18n()" [storeDate]="formData().to" (storeDateChange)="onPeriodChange('to', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <okr-error-note [errors]="periodErrors()" />
                <okr-error-note [errors]="pullsErrors()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          <div class="scroller">
            <ion-grid>
              <!-- column headers: app title and how far the consent has come -->
              <ion-row>
                <ion-col class="label" size="auto"></ion-col>
                @for (column of columnRows(); track column.tenantId) {
                  <ion-col>
                    <ion-item lines="none">
                      <ion-label class="title ion-text-wrap">
                        {{ column.title }}
                        @if (column.stateLabel) {
                          <ion-note class="ion-text-wrap" style="display: block">{{ column.stateLabel }}</ion-note>
                        }
                      </ion-label>
                    </ion-item>
                  </ion-col>
                }
              </ion-row>
              <!-- one row per transfer kind, a checkbox where that app offers it -->
              @for (source of rows(); track source) {
                <ion-row>
                  <ion-col class="label" size="auto">
                    <ion-label class="ion-text-wrap">{{ sourceLabel(source) }}</ion-label>
                  </ion-col>
                  @for (column of columnRows(); track column.tenantId) {
                    <ion-col>
                      @if (column.offered.includes(source)) {
                        <okr-checkbox [i18n]="checkboxI18n(column.tenantId, source)" [checked]="column.ticked.includes(source)" (checkedChange)="onSourceChange(column.tenantId, source, $event)" [readOnly]="isReadOnly()" />
                      }
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
export class ProfileDiarySourcesAccordion {
  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public formData = model.required<DiarySourceModel>();
  public readonly columns = input.required<DiarySourceColumn[]>();
  public readonly showForm = input<boolean>(true);   // toggled by the parent to reset the form
  public readonly color = input('primary');          // color of the accordion header
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly diarySourcesForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, diarySourcesValidations as any));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.diarySourcesForm);
  protected readonly periodErrors = computed(() => this.validationResult().getErrors('period'));
  protected readonly pullsErrors = computed(() => this.validationResult().getErrors('pulls'));

  protected readonly fromI18n = computed((): DateInputI18n => ({ name: 'diarySourcesFrom', label: this.i18n().diarySources_from(), placeholder: '' }));
  protected readonly toI18n = computed((): DateInputI18n => ({ name: 'diarySourcesTo', label: this.i18n().diarySources_to(), placeholder: '' }));

  /** Every transfer kind any app offers, in the catalogue's order. */
  protected readonly rows = computed(() => {
    const offered = new Set(this.columns().flatMap((c) => c.sources));
    return DIARY_SOURCES.filter((s) => offered.has(s));
  });

  protected readonly columnRows = computed(() => {
    const pulls = this.formData().pulls ?? [];
    return this.columns().map((column) => {
      const ticked = pulls.find((p) => p.tenantId === column.tenantId)?.sources ?? [];
      return {
        tenantId: column.tenantId,
        title: column.title,
        offered: column.sources,
        ticked,
        stateLabel: column.own ? '' : this.stateLabel(ticked, column.consented),
      };
    });
  });

  constructor() {
    effect(() => this.valid.emit(this.diarySourcesForm().valid()));
  }

  /******************************* actions *************************************** */
  protected onPeriodChange(bound: 'from' | 'to', value: string): void {
    const storeDate = value ?? '';
    if (this.formData()[bound] === storeDate) return;
    this.dirty.emit(true);
    this.formData.update((m) => ({ ...m, [bound]: storeDate }));
  }

  protected onSourceChange(tenantId: string, source: DiarySource, checked: boolean): void {
    const pulls = this.formData().pulls ?? [];
    const current = pulls.find((p) => p.tenantId === tenantId)?.sources ?? [];
    if (current.includes(source) === checked) return;
    const sources = checked ? [...current, source] : current.filter((s) => s !== source);
    // an app with nothing ticked leaves the doc: no entry is what «nicht angefragt» means
    const others = pulls.filter((p) => p.tenantId !== tenantId);
    const next: DiaryPull[] = sources.length > 0 ? [...others, { tenantId, sources }] : others;
    this.dirty.emit(true);
    this.formData.update((m) => ({ ...m, pulls: next }));
  }

  /******************************* helpers *************************************** */
  private stateLabel(requested: DiarySource[], consented: DiarySource[]): string {
    switch (consentState(requested, consented)) {
      case 'waiting': return this.i18n().diarySources_state_waiting();
      case 'confirmed': return this.i18n().diarySources_state_confirmed();
      case 'partial': return this.i18n().diarySources_state_partial();
      default: return this.i18n().diarySources_state_none();
    }
  }

  protected sourceLabel(source: DiarySource): string {
    switch (source) {
      case 'taskDone': return this.i18n().diaryTransfer_source_taskDone();
      case 'jasstafel': return this.i18n().diaryTransfer_source_jasstafel();
      case 'tracker': return this.i18n().diaryTransfer_source_tracker();
      default: return source;
    }
  }

  protected checkboxI18n(tenantId: string, source: DiarySource): CheckboxI18n {
    return { name: `${tenantId}.${source}`, label: '', helper: '' };
  }
}
