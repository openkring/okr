import { Component, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';

import { Header } from './header';

@Component({
  selector: 'okr-label-select-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header,
    IonIcon, IonContent, IonItem, IonLabel
  ],
  template: `
      <okr-header [i18n]="{ title: title() }" [isModal]="true" />
      <ion-content>
        @for (label of labels(); track label; let i = $index) {
          <ion-item lines="none" (click)="select(i)">
            @if(icons.length > 0) {
              <ion-icon src="{{icons()[i] | svgIcon}}" slot="start" />
            }
            <ion-label>{{ label }}</ion-label>
          </ion-item>
        }
      </ion-content>
  `
})
export class LabelSelectModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public labels = input<string[]>([]);
  public icons = input<string[]>([]);
  public title = input('@select.tag');

  public async select(index: number): Promise<boolean> {
    return await dismissOverlay(this.modalController, index, 'confirm');
  }
}



