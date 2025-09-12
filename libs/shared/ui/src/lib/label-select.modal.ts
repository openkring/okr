import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-label-select',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    HeaderComponent,
    IonIcon, IonContent, IonItem, IonLabel
  ],
  template: `
      <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
      <ion-content>
        @for (label of labels(); track label; let i = $index) {
          <ion-item lines="none" (click)="select(i)">
            @if(icons.length > 0) {
              <ion-icon src="{{icons()[i] | svgIcon}}" slot="start" />
            }
            <ion-label>{{ label | translate | async }}</ion-label>
          </ion-item>
        }
      </ion-content>
  `
})
export class LabelSelectModalComponent {
  private readonly modalController = inject(ModalController);

  public labels = input<string[]>([]);
  public icons = input<string[]>([]);
  public title = input('@general.operation.select.tag');

  public async select(index: number): Promise<boolean> {
    return await this.modalController.dismiss(index, 'confirm');
  }
}



