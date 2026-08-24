import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCheckbox, IonCol, IonDatetime, IonGrid, IonIcon, IonModal, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { InvitationState } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote, TextInput, TextInputI18n, TimeInput, TimeInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, getTodayStr, getWeekdayI18nKey } from '@okr/shared-util-core';
import { bestScheduleColumn, CaleventI18n, DEFAULT_POLL_TIME, MAX_SCHEDULE_POLL_COLUMNS, nextInvitationState, schedulePollValidations, SchedulePollColumn, SchedulePollFormData } from '@okr/calevent-util';

@Component({
  selector: 'okr-schedule-poll-form',
  standalone: true,
  imports: [
    TextInput, TimeInput, Checkbox, ErrorNote, SvgIconPipe, TranslatePipe, AsyncPipe,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonCheckbox, IonIcon, IonDatetime, IonModal,
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
    /* an occurrence the user may not answer (closed event, no invitation) — shown, never clickable */
    td.cell.locked { opacity: 0.45; }
    td.cell { font-size: 15px; font-weight: 700; color: var(--ion-color-medium); }
    td.yes { background: rgba(45, 211, 111, 0.25); color: var(--ion-color-success-shade); }
    td.no { background: rgba(235, 68, 90, 0.2); color: var(--ion-color-danger); }
    .comment { font-size: 10px; font-style: italic; color: var(--ion-color-medium); }
    /* inset shadow tints the row without overriding the yes/no cell colours */
    tr.mine td { font-weight: 600; box-shadow: inset 0 0 0 9999px rgba(56, 128, 255, 0.1); }
    tr.counts td { background: var(--ion-color-light-shade); font-weight: 600; }
    tr.counts td.best { color: var(--ion-color-success); }
    ion-modal.picker { --width: fit-content; --min-width: 300px; --height: fit-content; --border-radius: 8px; }
    .picker-wrapper { display: flex; flex-direction: column; padding: 8px; gap: 8px; }
    /* 'Zeit angeben' left, the time field right — one line, as in the spec */
    .time-row { display: flex; align-items: center; gap: 8px; }
    .time-row okr-checkbox { flex: 1 1 auto; }
    .time-row okr-time-input { flex: 0 0 130px; }
    .close-bar { display: flex; justify-content: flex-end; padding: 8px; }
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
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <ion-segment [value]="formData().multiSelect ? 'multiple' : 'single'"
                      (ionChange)="onModeChange($any($event).detail.value)">
                      <ion-segment-button value="single">{{ i18n().schedule_mode_single() }}</ion-segment-button>
                      <ion-segment-button value="multiple">{{ i18n().schedule_mode_multiple() }}</ion-segment-button>
                    </ion-segment>
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
                          @if (multiClose()) {
                            <!-- bare ion-checkbox, not okr-checkbox: this is a table header cell, and
                                 okr-checkbox wraps itself in an ion-item that blows the column up -->
                            <ion-checkbox [checked]="isPicked(column.id)" [attr.aria-label]="i18n().schedule_pick_dates()"
                              (ionChange)="togglePicked(column.id)" />
                          } @else {
                            <ion-button fill="clear" size="small" (click)="columnSelected.emit(column.id)">
                              {{ i18n().schedule_pick_date() }}
                            </ion-button>
                          }
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
                      <td class="member">
                        {{ row.firstName }} {{ row.lastName }}
                        @if (row.comment) { <div class="comment">{{ row.comment }}</div> }
                        @if (isFirst && showBulkToggle()) {
                          <div>
                            <ion-button fill="clear" size="small" (click)="toggleAllCells()">
                              {{ bulkLabel() }}
                            </ion-button>
                          </div>
                        }
                      </td>
                      @for (column of formData().columns; track column.id) {
                        <td class="cell"
                          [class.mine]="isFirst && !readOnly() && !column.locked"
                          [class.locked]="!!column.locked"
                          [class.yes]="row.responses[column.id] === 'accepted'"
                          [class.no]="row.responses[column.id] === 'declined'"
                          (click)="isFirst && !column.locked ? toggleCell(column.id) : null">
                          {{ cellIcon(row.responses[column.id]) }}
                        </td>
                      }
                      @if (showAddColumn()) { <td></td> }
                    </tr>
                  }
                  <tr class="counts">
                    <td class="member">{{ i18n().schedule_acceptances() }}</td>
                    @for (column of formData().columns; track column.id; let i = $index) {
                      <td [class.best]="showBest() && i === bestColumn()">
                        {{ acceptances()[i] }}{{ showBest() && i === bestColumn() ? ' ★' : '' }}
                      </td>
                    }
                    @if (showAddColumn()) { <td></td> }
                  </tr>
                </tbody>
              </table>
            </div>
            @if (multiClose()) {
              <div class="close-bar">
                <ion-button size="small" [disabled]="pickedColumns().length === 0"
                  (click)="columnsSelected.emit(pickedColumns())">
                  {{ i18n().schedule_close() }}
                </ion-button>
              </div>
            }
          </ion-card-content>
        </ion-card>

        @if (!readOnly() && !seriesMode()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-text-input [i18n]="commentI18n()" [value]="formData().rows[0].comment ?? ''"
                      (valueChange)="onCommentChange($event)" [maxLength]="80" [readOnly]="false" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        <ion-modal class="picker" [isOpen]="pickerOpen()" (ionModalDidDismiss)="pickerOpen.set(false)">
          <ng-template>
            <div class="picker-wrapper">
              <ion-segment [value]="pickerMode()" (ionChange)="pickerMode.set($any($event).detail.value)">
                <ion-segment-button value="date">{{ i18n().schedule_mode_date() }}</ion-segment-button>
                <ion-segment-button value="text">{{ i18n().schedule_mode_text() }}</ion-segment-button>
              </ion-segment>
              @if (pickerMode() === 'date') {
                <ion-datetime presentation="date" [preferWheel]="false"
                  [value]="pickedValue()" (ionChange)="pickedValue.set($any($event).detail.value)" />
                <div class="time-row">
                  <okr-checkbox [i18n]="withTimeI18n()" [checked]="pickedWithTime()"
                    (checkedChange)="pickedWithTime.set($event)" [readOnly]="false" />
                  @if (pickedWithTime()) {
                    <okr-time-input [value]="pickedTime()" (valueChange)="pickedTime.set($event)"
                      [i18n]="timeI18n()" [readOnly]="false" [locale]="locale()" [clearInput]="false" />
                  }
                </div>
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
  /**
   * Series-attendance mode: the same table, but answering a whole live series instead of a poll.
   * Drops the poll-only extras (winner star, response comment) and offers the bulk toggle.
   */
  public readonly seriesMode = input(false);
  /** Required by okr-time-input in the date picker. */
  public readonly locale = input.required<string>();

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** Single-select close: the one winning column. */
  public readonly columnSelected = output<string>();
  /** Multi-select close: every column the organizer confirmed. */
  public readonly columnsSelected = output<string[]>();

  protected readonly pickerOpen = signal(false);
  protected readonly pickerMode = signal<'date' | 'text'>('date');
  /** The date currently held in the picker — committed to a column only by addColumn(). */
  protected readonly pickedValue = signal('');
  /** The header text of a text column — committed only by addColumn(). */
  protected readonly pickedText = signal('');
  /** 'Zeit angeben': off = full-day proposal. Seeded from the previous entry by openPicker(). */
  protected readonly pickedWithTime = signal(false);
  /** The time held in the picker while `pickedWithTime` is on. */
  protected readonly pickedTime = signal(DEFAULT_POLL_TIME);
  /** The columns ticked for a multi-select close; never persisted, only emitted. */
  protected readonly pickedColumns = signal<string[]>([]);

  /**
   * Sticky defaults: the first entry sets the default for the next one, so proposing five Friday
   * evenings costs one time entry instead of five. Reset per form instance, not persisted.
   */
  private lastWithTime = false;
  private lastTime = DEFAULT_POLL_TIME;

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

  protected readonly commentI18n = computed(() => ({
    name: 'comment',
    label: this.i18n().schedule_comment_label(),
    placeholder: this.i18n().schedule_comment_placeholder(),
    helper: '',
  } as TextInputI18n));

  protected readonly withTimeI18n = computed(() => ({
    name: 'withTime',
    label: this.i18n().schedule_with_time(),
    helper: '',
  } as CheckboxI18n));

  /** No label by design — the field sits on the same line right of the 'Zeit angeben' checkbox. */
  protected readonly timeI18n = computed(() => ({
    name: 'startTime',
    label: '',
    placeholder: this.i18n().schedule_time_label(),
  } as TimeInputI18n));

  /** The organizer may confirm several columns — only on a live poll created in that mode. */
  protected readonly multiClose = computed(() => this.canClose() && this.formData().multiSelect);

  protected readonly nameErrors = computed(() => this.pollForm.name().errors().map(error => error.message ?? ''));

  protected readonly acceptances = computed(() =>
    this.formData().columns.map(column =>
      this.formData().rows.filter(row => row.responses[column.id] === 'accepted').length));

  protected readonly bestColumn = computed(() => bestScheduleColumn(this.acceptances()));

  /** Picking a winner is a poll concept — a live series has no "best" date. */
  protected readonly showBest = computed(() => !this.seriesMode());

  /** The columns the current user may actually answer; everything else stays untouched. */
  protected readonly openColumns = computed(() => this.formData().columns.filter(column => !column.locked));

  protected readonly showBulkToggle = computed(() =>
    this.seriesMode() && !this.readOnly() && this.openColumns().length > 0);

  /** Already in for every date -> the button signs off, otherwise it signs up. */
  protected readonly bulkTarget = computed<InvitationState>(() =>
    this.openColumns().every(column => this.formData().rows[0]?.responses[column.id] === 'accepted')
      ? 'declined' : 'accepted');

  protected readonly bulkLabel = computed(() => this.bulkTarget() === 'accepted'
    ? this.i18n().series_subscribe_all() : this.i18n().series_unsubscribe_all());

  /** One tap answers the whole series — the point of the series view. Locked columns are skipped. */
  protected toggleAllCells(): void {
    if (this.readOnly()) return;
    const state = this.bulkTarget();
    const openIds = this.openColumns().map(column => column.id);
    this.formData.update(data => {
      const rows = data.rows.map((row, index) => index === 0
        ? { ...row, responses: { ...row.responses, ...Object.fromEntries(openIds.map(id => [id, state])) } }
        : row);
      return { ...data, rows };
    });
    this.dirty.emit(true);
  }

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
   * Seeds the picker with today and the sticky defaults from the previous entry ('Zeit angeben' off
   * and 07:00 for the very first one). Full-day is now an EXPLICIT flag, not 00:00 inferred from an
   * untouched time wheel — so midnight is a pickable time again.
   */
  protected openPicker(): void {
    this.pickedValue.set(`${getTodayStr(DateFormat.IsoDate)}T00:00:00`);
    this.pickedText.set('');
    this.pickedWithTime.set(this.lastWithTime);
    this.pickedTime.set(this.lastTime);
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
    const withTime = !isText && this.pickedWithTime();
    this.pickerOpen.set(false);
    if (isText ? columnLabel.length === 0 : !isoDateTime) return;
    // an incomplete time ('07:') would be stored as-is and break every consumer — treat it as full day
    const hhmm = this.pickedTime();
    if (withTime && !/^\d{2}:\d{2}$/.test(hhmm)) return;
    const startDate = isText ? getTodayStr(DateFormat.StoreDate) : isoDateTime.substring(0, 10).replace(/-/g, '');
    const startTime = withTime ? hhmm : '';   // '' = full day, the column's own encoding
    if (!isText) {
      this.lastWithTime = withTime;
      if (withTime) this.lastTime = hhmm;
    }
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

  protected isPicked(columnId: string): boolean {
    return this.pickedColumns().includes(columnId);
  }

  protected togglePicked(columnId: string): void {
    this.pickedColumns.update(picked => picked.includes(columnId)
      ? picked.filter(id => id !== columnId)
      : [...picked, columnId]);
  }

  protected removeColumn(columnId: string): void {
    this.pickedColumns.update(picked => picked.filter(id => id !== columnId));
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

  /** The comment always belongs to rows[0] — the only row the current user may write. */
  protected onCommentChange(value: string): void {
    this.formData.update(data => ({
      ...data,
      rows: data.rows.map((row, index) => index === 0 ? { ...row, comment: value } : row),
    }));
    this.dirty.emit(true);
  }

  /** Draft only: 'Ein Termin suchen' vs 'Mehrere Termine festlegen'. Frozen at poll creation. */
  protected onModeChange(mode: string): void {
    this.formData.update(data => ({ ...data, multiSelect: mode === 'multiple' }));
    this.dirty.emit(true);
  }

  protected onNameChange(value: string): void {
    this.formData.update(data => ({ ...data, name: value }));
    this.dirty.emit(true);
  }
}
