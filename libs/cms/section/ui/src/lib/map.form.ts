import { AsyncPipe } from '@angular/common';
import { Component, inject, input, linkedSignal, model } from '@angular/core';
import { IonCol, IonLabel, IonRow } from '@ionic/angular/standalone';

import { TextInputComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { SectionFormModel } from '@bk2/cms/section/util';
import { ENV, LatitudeMask, LongitudeMask, ZoomMask } from '@bk2/shared/config';

@Component({
  selector: 'bk-map-section-form',
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonLabel,
    TextInputComponent
  ],
  template: `
    <ion-row>
      <ion-col size="12">
        <ion-label>{{ '@input.coordinates.label' | translate | async }}</ion-label>
      </ion-col>
    </ion-row>
    <ion-row>
      <ion-col size="12">
        <bk-text-input name="latitude" [(value)]="centerLatitude" [maxLength]=8 [mask]="latitudeMask" [showHelper]=true [readOnly]="!isContentAdmin()" />                                        
      </ion-col>
      <ion-col size="12">
        <bk-text-input name="longitude" [(value)]="centerLongitude" [maxLength]=7 [mask]="longitudeMask" [showHelper]=true [readOnly]="!isContentAdmin()" />                                        
      </ion-col>
      <ion-col size="12">
        <bk-text-input name="zoom" [(value)]="zoom" [maxLength]=2 [mask]="zoomMask" [showHelper]=true [readOnly]="!isContentAdmin()" />                                        
      </ion-col>

    </ion-row>
  `
})
export class MapSectionFormComponent {
  private readonly env = inject(ENV);
  public vm = model.required<SectionFormModel>();
  public isContentAdmin = input(false);

  protected centerLatitude = linkedSignal(() => this.vm().properties?.map?.centerLatitude ?? this.env.owner.latitude);
  protected centerLongitude= linkedSignal(() => this.vm().properties?.map?.centerLongitude ?? this.env.owner.longitude);
  protected zoom = linkedSignal(() => this.vm().properties?.map?.zoom ?? this.env.owner.zoom);

  protected latitudeMask = LatitudeMask;
  protected longitudeMask = LongitudeMask;
  protected zoomMask = ZoomMask;
} 