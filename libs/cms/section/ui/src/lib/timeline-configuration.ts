import { Component, computed, input, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TimelineConfig } from '@okr/shared-models';
import { Checkbox, CheckboxI18n } from '@okr/shared-ui';

interface TimelineConfigI18n {
  timeline_title:             Signal<string>;
  timeline_subtitle:          Signal<string>;
  timeline_vertical_label:    Signal<string>;
  timeline_vertical_helper:   Signal<string>;
}

@Component({
  selector: 'okr-timeline-config',
  standalone: true,
  imports: [
    Checkbox,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().timeline_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().timeline_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-checkbox
                [i18n]="verticalI18n()" [checked]="vertical()" (checkedChange)="onVerticalChange($event)"
                [showHelper]="true" [readOnly]="readOnly()"
              />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class TimelineConfiguration {
  // inputs
  public formData = model.required<TimelineConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<TimelineConfigI18n>();

  /** Legacy sections lack the field — horizontal is the default. */
  protected vertical = computed(() => this.formData()?.orientation === 'vertical');

  protected verticalI18n = computed(() => ({
    name: 'orientation',
    label: this.i18n().timeline_vertical_label(),
    helper: this.i18n().timeline_vertical_helper(),
  } as CheckboxI18n));

  protected onVerticalChange(vertical: boolean): void {
    this.formData.set({ orientation: vertical ? 'vertical' : 'horizontal' });
  }
}
