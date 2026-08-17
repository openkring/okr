import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonDatetime, IonGrid, IonIcon, IonModal, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { InvitationState } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, getWeekdayI18nKey } from '@okr/shared-util-core';
import { bestScheduleColumn, CaleventI18n, nextInvitationState, schedulePollValidations, SchedulePollColumn, SchedulePollFormData } from '@okr/calevent-util';

@Component({
  selector: 'okr-schedule-poll-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, ErrorNote, SvgIconPipe, TranslatePipe, AsyncPipe,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonDatetime, IonModal,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid var(--ion-color-light-shade); padding: 6px; text-align: center; }
    th.member, td.member { min-width: 140px; text-align: left; }
    .date-sub { font-size: 10px; color: var(--ion-color-medium); }
    tr.mine td { background: var(--ion-color-light); }
    td.cell.mine { cursor: pointer; user-select: none; }
    td.yes { background: rgba(45, 211, 111, 0.25); }
    td.no { background: rgba(235, 68, 90, 0.2); }
    tr.counts td { background: var(--ion-color-light-shade); font-weight: 600; }
    tr.counts td.best { color: var(--ion-color-success); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        @if (formData().isDraft) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="nameI18n()" [value]="formData().name"
                      (valueChange)="onNameChange($event)" [autofocus]="true"
                      [maxLength]="50" [readOnly]="readOnly()" />
                    <okr-error-note [errors]="nameErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-notes-input [i18n]="descriptionI18n()" [value]="formData().description"
                      (valueChange)="onDescriptionChange($event)" [readOnly]="readOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th class="member"></th>
                    @for (column of formData().columns; track column.id) {
                      <th>
                        <div>{{ weekdayKey(column) | translate | async }}</div>
                        <div class="date-sub">{{ dayLabel(column) }}</div>
                        @if (column.startTime) { <div class="date-sub">{{ column.startTime }}</div> }
                        @if (formData().isDraft) {
                          <ion-button fill="clear" size="small" [attr.aria-label]="i18n().schedule_column_remove()"
                            (click)="removeColumn(column.id)">
                            <ion-icon src="{{ 'close-circle' | svgIcon }}" />
                          </ion-button>
                        }
                        @if (canClose()) {
                          <ion-button fill="clear" size="small" (click)="columnSelected.emit(column.id)">
                            {{ i18n().schedule_close() }}
                          </ion-button>
                        }
                      </th>
                    }
                    @if (formData().isDraft) {
                      <th>
                        <ion-button fill="clear" [attr.aria-label]="i18n().schedule_column_add()"
                          (click)="pickerOpen.set(true)">
                          <ion-icon src="{{ 'add-circle' | svgIcon }}" />
                        </ion-button>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of formData().rows; track row.key; let isFirst = $first) {
                    <tr [class.mine]="isFirst">
                      <td class="member">{{ row.firstName }} {{ row.lastName }}</td>
                      @for (column of formData().columns; track column.id) {
                        <td class="cell"
                          [class.mine]="isFirst && !readOnly()"
                          [class.yes]="row.responses[column.id] === 'accepted'"
                          [class.no]="row.responses[column.id] === 'declined'"
                          (click)="isFirst ? toggleCell(column.id) : null">
                          {{ cellIcon(row.responses[column.id]) }}
                        </td>
                      }
                      @if (formData().isDraft) { <td></td> }
                    </tr>
                  }
                  <tr class="counts">
                    <td class="member">{{ i18n().schedule_acceptances() }}</td>
                    @for (column of formData().columns; track column.id; let i = $index) {
                      <td [class.best]="i === bestColumn()">
                        {{ acceptances()[i] }}{{ i === bestColumn() ? ' ★' : '' }}
                      </td>
                    }
                    @if (formData().isDraft) { <td></td> }
                  </tr>
                </tbody>
              </table>
            </div>
          </ion-card-content>
        </ion-card>

        <ion-modal [isOpen]="pickerOpen()" (ionModalDidDismiss)="pickerOpen.set(false)">
          <ng-template>
            <ion-datetime presentation="date-time" [preferWheel]="false"
              (ionChange)="onPicked($any($event).detail.value)" />
            <ion-button expand="block" (click)="pickerOpen.set(false)">
              {{ i18n().schedule_date_confirm() }}
            </ion-button>
          </ng-template>
        </ion-modal>
      </form>
    }
  `,
})
export class SchedulePollForm {
  public readonly i18n = input.required<CaleventI18n>();
  public formData = model.required<SchedulePollFormData>();
  public readonly canClose = input(false);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly columnSelected = output<string>();

  protected readonly pickerOpen = signal(false);

  protected readonly pollForm = form(this.formData, (path) =>
    validateVestTree(path, schedulePollValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.pollForm().valid()));
  }

  protected readonly nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().schedule_name_label(),
    placeholder: this.i18n().schedule_name_placeholder(),
    helper: '',
  } as TextInputI18n));

  protected readonly descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().schedule_description_label(),
    placeholder: '',
  } as NotesInputI18n));

  protected readonly nameErrors = computed(() => this.pollForm.name().errors().map(error => error.message ?? ''));

  protected readonly acceptances = computed(() =>
    this.formData().columns.map(column =>
      this.formData().rows.filter(row => row.responses[column.id] === 'accepted').length));

  protected readonly bestColumn = computed(() => bestScheduleColumn(this.acceptances()));

  /** Returns an i18n KEY ('@calevent/feature.weekday.abbreviation.friday') — the template pipes it. */
  protected weekdayKey(column: SchedulePollColumn): string {
    return getWeekdayI18nKey(column.startDate, true);
  }

  protected dayLabel(column: SchedulePollColumn): string {
    return convertDateFormatToString(column.startDate, DateFormat.StoreDate, DateFormat.DDMM, false);
  }

  protected cellIcon(state: InvitationState | undefined): string {
    if (state === 'accepted') return '✔';
    if (state === 'declined') return '✘';
    return '–';
  }

  /** Tapping the current user's cell cycles it; the parent saves on confirm. */
  protected toggleCell(columnId: string): void {
    if (this.readOnly()) return;
    this.formData.update(data => {
      const rows = data.rows.map((row, index) => index === 0
        ? { ...row, responses: { ...row.responses, [columnId]: nextInvitationState(row.responses[columnId] ?? 'pending') } }
        : row);
      return { ...data, rows };
    });
    this.dirty.emit(true);
  }

  /** ion-datetime emits 'yyyy-MM-ddTHH:mm:ss'; a time of 00:00 counts as a full-day proposal. */
  protected onPicked(isoDateTime: string | null): void {
    if (!isoDateTime) return;
    const startDate = isoDateTime.substring(0, 10).replace(/-/g, '');
    const hhmm = isoDateTime.substring(11, 16);          // 'HH:mm', the repo's startTime format
    const startTime = hhmm === '00:00' ? '' : hhmm;
    this.formData.update(data => {
      if (data.columns.some(c => c.startDate === startDate && c.startTime === startTime)) return data;
      const id = `c${data.columns.length}${startDate}${startTime}`;
      const columns = [...data.columns, { id, startDate, startTime }]
        .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
      const rows = data.rows.map((row, index) => index === 0
        ? { ...row, responses: { ...row.responses, [id]: 'accepted' as InvitationState } }
        : row);
      return { ...data, columns, rows };
    });
    this.dirty.emit(true);
  }

  protected removeColumn(columnId: string): void {
    this.formData.update(data => ({
      ...data,
      columns: data.columns.filter(c => c.id !== columnId),
      rows: data.rows.map(row => {
        const responses = { ...row.responses };
        delete responses[columnId];
        return { ...row, responses };
      }),
    }));
    this.dirty.emit(true);
  }

  protected onNameChange(value: string): void {
    this.formData.update(data => ({ ...data, name: value }));
    this.dirty.emit(true);
  }

  protected onDescriptionChange(value: string): void {
    this.formData.update(data => ({ ...data, description: value }));
    this.dirty.emit(true);
  }
}
