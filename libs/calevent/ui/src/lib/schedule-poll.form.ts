import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonDatetime, IonGrid, IonIcon, IonModal, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { InvitationState } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, getTodayStr, getWeekdayI18nKey } from '@okr/shared-util-core';
import { bestScheduleColumn, CaleventI18n, MAX_SCHEDULE_POLL_COLUMNS, nextInvitationState, schedulePollValidations, SchedulePollColumn, SchedulePollFormData } from '@okr/calevent-util';

@Component({
  selector: 'okr-schedule-poll-form',
  standalone: true,
  imports: [
    TextInput, ErrorNote, SvgIconPipe, TranslatePipe, AsyncPipe,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonDatetime, IonModal,
    IonSegment, IonSegmentButton,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 2px solid var(--ion-background-color, #fff); padding: 6px; text-align: center; }
    th { background: var(--ion-color-light); }
    th.member, td.member { min-width: 140px; text-align: left; }
    td.member { background: rgba(56, 128, 255, 0.12); }
    .date-sub { font-size: 10px; color: var(--ion-color-medium); }
    td.cell.mine { cursor: pointer; user-select: none; }
    td.cell { font-size: 15px; font-weight: 700; color: var(--ion-color-medium); }
    td.yes { background: rgba(45, 211, 111, 0.25); color: var(--ion-color-success-shade); }
    td.no { background: rgba(235, 68, 90, 0.2); color: var(--ion-color-danger); }
    tr.counts td { background: var(--ion-color-light-shade); font-weight: 600; }
    tr.counts td.best { color: var(--ion-color-success); }
    ion-modal.picker { --width: fit-content; --min-width: 300px; --height: fit-content; --border-radius: 8px; }
    .picker-wrapper { display: flex; flex-direction: column; padding: 8px; gap: 8px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        @if (formData().isDraft) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-text-input [i18n]="nameI18n()" [value]="formData().name"
                      (valueChange)="onNameChange($event)" [autofocus]="true"
                      [maxLength]="50" [readOnly]="readOnly()" />
                    <okr-error-note [errors]="nameErrors()" />
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
                        @if (column.columnLabel) {
                          <div>{{ column.columnLabel }}</div>
                        } @else {
                          <div>{{ weekdayKey(column) | translate | async }}</div>
                          <div class="date-sub">{{ dayLabel(column) }}</div>
                          @if (column.startTime) { <div class="date-sub">{{ column.startTime }}</div> }
                        }
                        @if (formData().isDraft) {
                          <ion-button fill="clear" size="small" [attr.aria-label]="i18n().schedule_column_remove()"
                            (click)="removeColumn(column.id)">
                            <ion-icon src="{{ 'close-circle' | svgIcon }}" />
                          </ion-button>
                        }
                        @if (canClose() && !column.columnLabel) {
                          <ion-button fill="clear" size="small" (click)="columnSelected.emit(column.id)">
                            {{ i18n().schedule_pick_date() }}
                          </ion-button>
                        }
                      </th>
                    }
                    @if (showAddColumn()) {
                      <th>
                        <ion-button fill="clear" [attr.aria-label]="i18n().schedule_column_add()"
                          (click)="openPicker()">
                          <ion-icon src="{{ 'add-circle' | svgIcon }}" />
                        </ion-button>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of formData().rows; track row.key; let isFirst = $first) {
                    <tr [class.mine]="isFirst && !readOnly()">
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
                      @if (showAddColumn()) { <td></td> }
                    </tr>
                  }
                  <tr class="counts">
                    <td class="member">{{ i18n().schedule_acceptances() }}</td>
                    @for (column of formData().columns; track column.id; let i = $index) {
                      <td [class.best]="i === bestColumn()">
                        {{ acceptances()[i] }}{{ i === bestColumn() ? ' ★' : '' }}
                      </td>
                    }
                    @if (showAddColumn()) { <td></td> }
                  </tr>
                </tbody>
              </table>
            </div>
          </ion-card-content>
        </ion-card>

        <ion-modal class="picker" [isOpen]="pickerOpen()" (ionModalDidDismiss)="pickerOpen.set(false)">
          <ng-template>
            <div class="picker-wrapper">
              <ion-segment [value]="pickerMode()" (ionChange)="pickerMode.set($any($event).detail.value)">
                <ion-segment-button value="date">{{ i18n().schedule_mode_date() }}</ion-segment-button>
                <ion-segment-button value="text">{{ i18n().schedule_mode_text() }}</ion-segment-button>
              </ion-segment>
              @if (pickerMode() === 'date') {
                <ion-datetime presentation="date-time" [preferWheel]="false"
                  [value]="pickedValue()" (ionChange)="pickedValue.set($any($event).detail.value)" />
              } @else {
                <okr-text-input [i18n]="textColumnI18n()" [value]="pickedText()"
                  (valueChange)="pickedText.set($event)" [autofocus]="true" [maxLength]="20" [readOnly]="false" />
              }
              <ion-button expand="block" (click)="addColumn()">
                {{ pickerMode() === 'date' ? i18n().schedule_date_confirm() : i18n().schedule_text_confirm() }}
              </ion-button>
            </div>
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
  protected readonly pickerMode = signal<'date' | 'text'>('date');
  /** The date currently held in the picker — committed to a column only by addColumn(). */
  protected readonly pickedValue = signal('');
  /** The header text of a text column — committed only by addColumn(). */
  protected readonly pickedText = signal('');

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

  protected readonly textColumnI18n = computed(() => ({
    name: 'columnLabel',
    label: this.i18n().schedule_text_label(),
    placeholder: '',
    helper: '',
  } as TextInputI18n));

  protected readonly nameErrors = computed(() => this.pollForm.name().errors().map(error => error.message ?? ''));

  protected readonly acceptances = computed(() =>
    this.formData().columns.map(column =>
      this.formData().rows.filter(row => row.responses[column.id] === 'accepted').length));

  protected readonly bestColumn = computed(() => bestScheduleColumn(this.acceptances()));

  /** The trailing `+` header (and its filler cells) — gone once the column cap is reached. */
  protected readonly showAddColumn = computed(() =>
    this.formData().isDraft && this.formData().columns.length < MAX_SCHEDULE_POLL_COLUMNS);

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

  /**
   * Seeds the picker with today at 00:00 so a plain day tap keeps 00:00 and stays a FULL-DAY
   * proposal (spec §1.1). A time is only set when the author explicitly opens the time wheel.
   * Consequence: midnight cannot be picked as a time — it means "full day".
   */
  protected openPicker(): void {
    this.pickedValue.set(`${getTodayStr(DateFormat.IsoDate)}T00:00:00`);
    this.pickedText.set('');
    this.pickerOpen.set(true);
  }

  /**
   * Appends the picked date (or text) as a new column — only from the confirm button, never on
   * ionChange: adjusting the time after picking a day must edit the pick, not append a second column.
   * A text column is dated today purely so it can be stored as a calevent; it never shows in a calendar.
   */
  protected addColumn(): void {
    const isText = this.pickerMode() === 'text';
    const columnLabel = this.pickedText().trim();
    const isoDateTime = this.pickedValue();
    this.pickerOpen.set(false);
    if (isText ? columnLabel.length === 0 : !isoDateTime) return;
    const startDate = isText ? getTodayStr(DateFormat.StoreDate) : isoDateTime.substring(0, 10).replace(/-/g, '');
    const hhmm = isoDateTime.substring(11, 16);          // 'HH:mm', the repo's startTime format
    const startTime = isText || hhmm === '00:00' ? '' : hhmm;
    this.formData.update(data => {
      if (isText
        ? data.columns.some(c => c.columnLabel === columnLabel)
        : data.columns.some(c => !c.columnLabel && c.startDate === startDate && c.startTime === startTime)) return data;
      const id = `c${data.columns.length}${startDate}${startTime}${columnLabel}`;
      // dates first and in order; text columns last (yyyyMMdd always sorts before the '9' prefix)
      const columns = [...data.columns, { id, startDate, startTime, columnLabel: isText ? columnLabel : '' }]
        .sort((a, b) => (a.columnLabel ? '9' + a.columnLabel : a.startDate + a.startTime)
          .localeCompare(b.columnLabel ? '9' + b.columnLabel : b.startDate + b.startTime));
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
}
