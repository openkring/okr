import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TripStatsConfig } from '@bk2/shared-models';
import { StringSelect, StringSelectI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-string-select
                [i18n]="viewTypeI18n()"
                [selectedString]="viewType()"
                (selectedStringChange)="onFieldChange('viewType', $event)"
                [stringList]="['list', 'graph']"
                [readOnly]="false"
              />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select
                [i18n]="contentTypeI18n()"
                [selectedString]="contentType()"
                (selectedStringChange)="onFieldChange('contentType', $event)"
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
  private readonly i18nService = inject(I18nService);

  public formData = model.required<TripStatsConfig>();
  public title = input('@content.section.type.tripStats.edit');

  protected viewType    = linkedSignal(() => this.formData().viewType    ?? 'list');
  protected contentType = linkedSignal(() => this.formData().contentType ?? 'boat');

  protected readonly fieldI18n = this.i18nService.translateAll({
    viewType_label:    PFX + 'tripStats.viewType_label',
    contentType_label: PFX + 'tripStats.contentType_label',
  });

  protected viewTypeI18n    = computed(() => ({ name: 'viewType',    label: this.fieldI18n.viewType_label()    } as StringSelectI18n));
  protected contentTypeI18n = computed(() => ({ name: 'contentType', label: this.fieldI18n.contentType_label() } as StringSelectI18n));

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
