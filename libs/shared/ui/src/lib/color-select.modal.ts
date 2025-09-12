import { AsyncPipe } from '@angular/common';
import { Component, Injectable, OnInit, inject, input } from '@angular/core';
import { IonButton, IonContent, IonHeader, IonItem, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { COLOR_PICKER_CONFIG, ChromePickerComponent, ColorPickerControl, ColorType, IColorPickerConfig } from '@iplab/ngx-color-picker';

import { TranslatePipe } from '@bk2/shared-i18n';

const DEFAULT_COLOR = '#2196F3';

@Injectable()
class ColorPickerConfiguration implements IColorPickerConfig {
    public presetsTitle = '{0}. Long-click to show alternate shades.'; // {0} is the place where hex value will be placed
    public get indicatorTitle(): string {
        return 'Copy color to clipboard';
    }
}

@Component({
  selector: 'bk-color-select-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    ChromePickerComponent,
    IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonButton
  ],
  providers: [
    { provide: COLOR_PICKER_CONFIG, useClass: ColorPickerConfiguration }
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ '@input.color.select' | translate | async }}</ion-title>
      </ion-toolbar>  
    </ion-header>
    <ion-content>
      <chrome-picker [control]="colorControl" [color]="hexColor()" />
      <ion-item lines="none">
        <ion-button fill="clear" (click)="cancel()">{{ '@general.operation.change.cancel' | translate | async }}</ion-button>
        <ion-button fill="clear" (click)="save()">{{ '@general.operation.change.ok' | translate | async }}</ion-button>
      </ion-item>
    </ion-content>
  `
})
export class ColorSelectModalComponent implements OnInit{
  private readonly modalController = inject(ModalController);
  public hexColor = input(DEFAULT_COLOR);
  public colorControl = new ColorPickerControl();

  ngOnInit() {
    this.colorControl.initType = ColorType.hex;
  }

  public save(): Promise<boolean> {
    return this.modalController.dismiss(this.colorControl.value.toHexString(), 'confirm');
  }

  public cancel(): Promise<boolean> {
    return this.modalController.dismiss(null, 'cancel');
  }
}
