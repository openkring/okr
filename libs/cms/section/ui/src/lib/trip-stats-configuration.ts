import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TripStatsConfig } from '@bk2/shared-models';
import { StringSelect, StringSelectI18n } from '@bk2/shared-ui';

interface TripStatsConfigI18n {
  tripstats_title:               Signal<string>,
  tripstats_type_view_label:     Signal<string>,
  tripstats_type_content_label:  Signal<string>
}

@Component({
  selector: 'bk-trip-stats-config',
  standalone: true,
  imports: [
    StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().tripstats_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-string-select
                [i18n]="viewTypeI18n()"
                [selectedString]="viewType()"
                (selectedStringChange)="onViewTypeChange($event)"
                [stringList]="['list', 'graph']"
                [readOnly]="false"
              />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select
                [i18n]="contentTypeI18n()"
                [selectedString]="contentType()"
                (selectedStringChange)="onContentTypeChange($event)"
                [stringList]="['boat', 'member']"
                [readOnly]="false"
              />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `,
})
export class TripStatsConfiguration {
  // inputs
  public formData = model.required<TripStatsConfig>();
  public readonly i18n = input.required<TripStatsConfigI18n>();

  protected viewType    = linkedSignal(() => this.formData().viewType    ?? 'list');
  protected contentType = linkedSignal(() => this.formData().contentType ?? 'boat');

  protected viewTypeI18n    = computed(() => ({ name: 'viewType',    label: this.i18n().tripstats_type_view_label()    } as StringSelectI18n));
  protected contentTypeI18n = computed(() => ({ name: 'contentType', label: this.i18n().tripstats_type_content_label() } as StringSelectI18n));

  protected onViewTypeChange(viewType: string): void {
    this.formData.update(vm => ({ ...vm, viewType: viewType as TripStatsConfig['viewType'] }));
  }

  protected onContentTypeChange(contentType: string): void {
    this.formData.update(vm => ({ ...vm, contentType: contentType as TripStatsConfig['contentType'] }));
  }
}
