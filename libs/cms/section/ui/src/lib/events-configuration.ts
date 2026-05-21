import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { EventsConfig } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
          <ion-card-title>{{ title() }}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() }}</ion-card-subtitle>
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
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<EventsConfig>();
  public title = input('@content.section.type.events.title');
  public subTitle = input('@content.section.type.events.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected moreUrl = linkedSignal(() => this.formData().moreUrl ?? '');
  protected maxEvents = linkedSignal(() => this.formData().maxEvents ?? undefined);
  protected showPastEvents = linkedSignal(() => this.formData().showPastEvents ?? false);
  protected showUpcomingEvents = linkedSignal(() => this.formData().showUpcomingEvents ?? true);
  protected showEventTime = linkedSignal(() => this.formData().showEventTime ?? true);
  protected showEventLocation = linkedSignal(() => this.formData().showEventLocation ?? true);

  protected readonly fieldI18n = this.i18nService.translateAll({
    moreUrl_label:              PFX + 'moreUrl.label',
    moreUrl_placeholder:        PFX + 'moreUrl.placeholder',
    moreUrl_helper:             PFX + 'moreUrl.helper',
    maxEvents_label:            PFX + 'maxEvents.label',
    maxEvents_placeholder:      PFX + 'maxEvents.placeholder',
    maxEvents_helper:           PFX + 'maxEvents.helper',
    showPastEvents_label:       PFX + 'showPastEvents.label',
    showPastEvents_helper:      PFX + 'showPastEvents.helper',
    showUpcomingEvents_label:   PFX + 'showUpcomingEvents.label',
    showUpcomingEvents_helper:  PFX + 'showUpcomingEvents.helper',
    showEventTime_label:        PFX + 'showEventTime.label',
    showEventTime_helper:       PFX + 'showEventTime.helper',
    showEventLocation_label:    PFX + 'showEventLocation.label',
    showEventLocation_helper:   PFX + 'showEventLocation.helper',
  });

  protected maxEventsI18n = computed(() => ({ name: 'maxEvents', label: this.fieldI18n.maxEvents_label(), placeholder: this.fieldI18n.maxEvents_placeholder(), helper: this.fieldI18n.maxEvents_helper() } as NumberInputI18n));

  protected moreUrlI18n = computed(() => ({
    name: 'moreUrl',
    label: this.fieldI18n.moreUrl_label(),
    placeholder: this.fieldI18n.moreUrl_placeholder(),
    helper: this.fieldI18n.moreUrl_helper(),
  } as TextInputI18n));

  protected showPastEventsI18n = computed(() => ({
    name: 'showPastEvents',
    label: this.fieldI18n.showPastEvents_label(),
    helper: this.fieldI18n.showPastEvents_helper(),
  } as CheckboxI18n));

  protected showUpcomingEventsI18n = computed(() => ({
    name: 'showUpcomingEvents',
    label: this.fieldI18n.showUpcomingEvents_label(),
    helper: this.fieldI18n.showUpcomingEvents_helper(),
  } as CheckboxI18n));

  protected showEventTimeI18n = computed(() => ({
    name: 'showEventTime',
    label: this.fieldI18n.showEventTime_label(),
    helper: this.fieldI18n.showEventTime_helper(),
  } as CheckboxI18n));

  protected showEventLocationI18n = computed(() => ({
    name: 'showEventLocation',
    label: this.fieldI18n.showEventLocation_label(),
    helper: this.fieldI18n.showEventLocation_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, $event: string | boolean | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
