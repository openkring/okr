import { Component, Injectable, OnInit, inject, input } from '@angular/core';
import { IonButton, IonContent, IonHeader, IonItem, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { COLOR_PICKER_CONFIG, ChromePickerComponent, ColorPickerControl, ColorType, IColorPickerConfig } from '@iplab/ngx-color-picker';


const DEFAULT_COLOR = '#2196F3';

@Injectable()
class ColorPickerConfiguration implements IColorPickerConfig {
    public presetsTitle = '{0}. Long-click to show alternate shades.'; // {0} is the place where hex value will be placed
    public get indicatorTitle(): string {
        return 'Copy color to clipboard';
    }
}

export interface ColorSelectI18n {
  select: string;
  cancel: string;
  ok: string;
}

@Component({
  selector: 'bk-color-select-modal',
  standalone: true,
  imports: [
    
    ChromePickerComponent,
    IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonButton
  ],
  providers: [
    { provide: COLOR_PICKER_CONFIG, useClass: ColorPickerConfiguration }
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ i18n().select }}</ion-title>
      </ion-toolbar>  
    </ion-header>
    <ion-content>
      <chrome-picker [control]="colorControl" [color]="hexColor()" />
      <ion-item lines="none">
        <ion-button fill="clear" (click)="cancel()">{{ i18n().cancel }}</ion-button>
        <ion-button fill="clear" (click)="save()">{{ i18n().ok }}</ion-button>
      </ion-item>
    </ion-content>
  `
})
export class ColorSelectModal implements OnInit{
  private readonly modalController = inject(ModalController);

  // inputs
  public i18n = input.required<ColorSelectI18n>();
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
