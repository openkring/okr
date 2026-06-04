import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { EventsConfig } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';

interface EventsConfigI18n {
  event_title:                  Signal<string>;
  event_subtitle:               Signal<string>;
  event_more_label:             Signal<string>;
  event_more_placeholder:       Signal<string>;
  event_more_helper:            Signal<string>;
  event_max_label:              Signal<string>;
  event_max_placeholder:        Signal<string>;
  event_max_helper:             Signal<string>;
  event_show_past_label:        Signal<string>;
  event_show_past_helper:       Signal<string>;
  event_show_future_label:      Signal<string>;
  event_show_future_helper:     Signal<string>;
  event_show_time_label:        Signal<string>;
  event_show_time_helper:       Signal<string>;
  event_show_location_label:    Signal<string>;
  event_show_location_helper:   Signal<string>;
}

@Component({
  selector: 'bk-events-config',
  standalone: true,
  imports: [
    TextInput, Checkbox, NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ i18n().event_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().event_subtitle() }}</ion-card-subtitle>
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
              <bk-text-input [i18n]="moreUrlI18n()" [value]="moreUrl()" (valueChange)="onFieldChange('moreUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-number-input [i18n]="maxEventsI18n()" [value]="maxEvents()" (valueChange)="onFieldChange('maxEvents', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showPastEventsI18n()" [checked]="showPastEvents()" (checkedChange)="onFieldChange('showPastEvents', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showUpcomingEventsI18n()" [checked]="showUpcomingEvents()" (checkedChange)="onFieldChange('showUpcomingEvents', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showEventTimeI18n()" [checked]="showEventTime()" (checkedChange)="onFieldChange('showEventTime', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showEventLocationI18n()" [checked]="showEventLocation()" (checkedChange)="onFieldChange('showEventLocation', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EventsConfiguration {
  // inputs
  public formData = model.required<EventsConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<EventsConfigI18n>();

  // fields
  protected moreUrl = linkedSignal(() => this.formData().moreUrl ?? '');
  protected maxEvents = linkedSignal(() => this.formData().maxEvents ?? undefined);
  protected showPastEvents = linkedSignal(() => this.formData().showPastEvents ?? false);
  protected showUpcomingEvents = linkedSignal(() => this.formData().showUpcomingEvents ?? true);
  protected showEventTime = linkedSignal(() => this.formData().showEventTime ?? true);
  protected showEventLocation = linkedSignal(() => this.formData().showEventLocation ?? true);

  protected maxEventsI18n = computed(() => ({ name: 'maxEvents', label: this.i18n().event_max_label(), placeholder: this.i18n().event_max_placeholder(), helper: this.i18n().event_max_helper() } as NumberInputI18n));

  protected moreUrlI18n = computed(() => ({
    name: 'moreUrl',
    label: this.i18n().event_more_label(),
    placeholder: this.i18n().event_more_placeholder(),
    helper: this.i18n().event_more_helper(),
  } as TextInputI18n));

  protected showPastEventsI18n = computed(() => ({
    name: 'showPastEvents',
    label: this.i18n().event_show_past_label(),
    helper: this.i18n().event_show_past_helper(),
  } as CheckboxI18n));

  protected showUpcomingEventsI18n = computed(() => ({
    name: 'showUpcomingEvents',
    label: this.i18n().event_show_future_label(),
    helper: this.i18n().event_show_future_helper(),
  } as CheckboxI18n));

  protected showEventTimeI18n = computed(() => ({
    name: 'showEventTime',
    label: this.i18n().event_show_time_label(),
    helper: this.i18n().event_show_time_helper(),
  } as CheckboxI18n));

  protected showEventLocationI18n = computed(() => ({
    name: 'showEventLocation',
    label: this.i18n().event_show_location_label(),
    helper: this.i18n().event_show_location_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, $event: string | boolean | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
