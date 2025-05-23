import { Component, computed, input, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared/categories';
import { AvatarPipe, CategoryPlainNamePipe } from '@bk2/shared/pipes';
import { AvatarInfo, ColorIonic } from '@bk2/shared/models';
import { createFullName } from '@bk2/shared/util';
import { TranslatePipe } from '@bk2/shared/i18n';

import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-avatar-select',
  imports: [
    AvatarPipe, AsyncPipe, CategoryPlainNamePipe, TranslatePipe,
    IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle
  ],
  template: `
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ title() | translate | async }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
        @if(avatar()) {
          <ion-avatar slot="start">
            <ion-img src="{{ modelType() + '.' + key() | avatar | async }}" alt="Avatar icon" />
          </ion-avatar>
          <ion-label>{{name()}}</ion-label>
        }
        @if(!readOnly()) {
          <ion-label>
            <ion-button slot="start" fill="clear" (click)="selectClicked.emit()">{{ selectLabel() | translate | async }}</ion-button>
          </ion-label>
        }
      </ion-item>
    </ion-card-content>
  </ion-card>
  `,
})
export class AvatarSelectComponent {

  public avatar = input<AvatarInfo>();
  public title = input('Avatar');
  public color = input<ColorIonic>(ColorIonic.White);
  public selectLabel = input('@general.operation.select.label');
  public readOnly = input(false);

  public selectClicked = output<void>();

  modelType = computed(() => this.avatar()?.modelType);
  key = computed(() => this.avatar()?.key);
  name = computed(() => createFullName(this.avatar()?.name1 ?? '', this.avatar()?.name2 ?? ''));

  protected colorsIonic = ColorsIonic;
}

