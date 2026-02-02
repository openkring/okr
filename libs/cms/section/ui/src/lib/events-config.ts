import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { EventsConfig } from '@bk2/shared-models';
import { CheckboxComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-events-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    TextInputComponent, CheckboxComponent, NumberInputComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `  

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ title() | translate | async}}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() | translate | async}}</ion-card-subtitle>
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
              <bk-text-input name="moreUrl" [value]="moreUrl()" (valueChange)="onFieldChange('moreUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-number-input name="maxEvents" [value]="maxEvents()" (valueChange)="onFieldChange('maxEvents', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showPastEvents" [checked]="showPastEvents()" (checkedChange)="onFieldChange('showPastEvents', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showUpcomingEvents" [checked]="showUpcomingEvents()" (checkedChange)="onFieldChange('showUpcomingEvents', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showEventTime" [checked]="showEventTime()" (checkedChange)="onFieldChange('showEventTime', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showEventLocation" [checked]="showEventLocation()" (checkedChange)="onFieldChange('showEventLocation', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EventsConfigComponent {
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

  protected onFieldChange(fieldName: string, $event: string | boolean | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
