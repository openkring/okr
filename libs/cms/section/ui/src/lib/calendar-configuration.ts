import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';

/**
 * The editable subset of FullCalendar's `CalendarOptions` exposed in the CMS UI.
 * Kept as a narrow structural type so the dumb UI lib does not depend on @fullcalendar.
 * Every field is a valid `CalendarOptions` key; the renderer (feature lib) merges these
 * over its hardcoded plugin/toolbar defaults.
 */
export interface CalendarDisplayOptions {
  initialView?: string;   // 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
  slotMinTime?: string;   // earliest time shown, e.g. '05:00:00'
  slotMaxTime?: string;   // latest time shown, e.g. '22:00:00'
  weekNumbers?: boolean;  // show ISO week numbers
  editable?: boolean;     // allow drag/drop and resize of events
}

interface CalendarConfigI18n {
  cal_title:                Signal<string>;
  cal_subtitle:             Signal<string>;
  cal_view_label:           Signal<string>;
  cal_slotMinTime_label:        Signal<string>;
  cal_slotMinTime_placeholder:  Signal<string>;
  cal_slotMinTime_helper:       Signal<string>;
  cal_slotMaxTime_label:        Signal<string>;
  cal_slotMaxTime_placeholder:  Signal<string>;
  cal_slotMaxTime_helper:       Signal<string>;
  cal_weekNumbers_label:    Signal<string>;
  cal_weekNumbers_helper:   Signal<string>;
  cal_editable_label:       Signal<string>;
  cal_editable_helper:      Signal<string>;
}

export const CALENDAR_VIEWS = ['dayGridMonth', 'timeGridWeek', 'timeGridDay'];

@Component({
  selector: 'bk-calendar-config',
  standalone: true,
  imports: [
    TextInput, Checkbox, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().cal_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().cal_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-string-select [i18n]="viewI18n()" [selectedString]="initialView()" (selectedStringChange)="onFieldChange('initialView', $event)" [readOnly]="readOnly()" [stringList]="views" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="slotMinTimeI18n()" [value]="slotMinTime()" (valueChange)="onFieldChange('slotMinTime', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="slotMaxTimeI18n()" [value]="slotMaxTime()" (valueChange)="onFieldChange('slotMaxTime', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="weekNumbersI18n()" [checked]="weekNumbers()" (checkedChange)="onFieldChange('weekNumbers', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="editableI18n()" [checked]="editable()" (checkedChange)="onFieldChange('editable', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class CalendarConfiguration {
  // inputs
  public formData = model.required<CalendarDisplayOptions>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<CalendarConfigI18n>();

  // passing constants to the template
  protected views = CALENDAR_VIEWS;

  // fields
  protected initialView = linkedSignal(() => this.formData().initialView ?? 'timeGridWeek');
  protected slotMinTime = linkedSignal(() => this.formData().slotMinTime ?? '05:00:00');
  protected slotMaxTime = linkedSignal(() => this.formData().slotMaxTime ?? '22:00:00');
  protected weekNumbers = linkedSignal(() => this.formData().weekNumbers ?? true);
  protected editable = linkedSignal(() => this.formData().editable ?? true);

  protected viewI18n = computed(() => ({ name: 'initialView', label: this.i18n().cal_view_label() } as StringSelectI18n));

  protected slotMinTimeI18n = computed(() => ({
    name: 'slotMinTime',
    label: this.i18n().cal_slotMinTime_label(),
    placeholder: this.i18n().cal_slotMinTime_placeholder(),
    helper: this.i18n().cal_slotMinTime_helper(),
  } as TextInputI18n));

  protected slotMaxTimeI18n = computed(() => ({
    name: 'slotMaxTime',
    label: this.i18n().cal_slotMaxTime_label(),
    placeholder: this.i18n().cal_slotMaxTime_placeholder(),
    helper: this.i18n().cal_slotMaxTime_helper(),
  } as TextInputI18n));

  protected weekNumbersI18n = computed(() => ({
    name: 'weekNumbers',
    label: this.i18n().cal_weekNumbers_label(),
    helper: this.i18n().cal_weekNumbers_helper(),
  } as CheckboxI18n));

  protected editableI18n = computed(() => ({
    name: 'editable',
    label: this.i18n().cal_editable_label(),
    helper: this.i18n().cal_editable_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, $event: string | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
