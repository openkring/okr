import { Component, computed, input, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonImg, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ColorsIonic } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-avatar-select',
  standalone: true,
  imports: [
    AsyncPipe, CategoryPlainNamePipe, TranslatePipe, AvatarPipe,
    IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonNote
  ],
  template: `
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ headerTitle() | translate | async }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
        @if(avatar()) {
          <ion-avatar slot="start">
            <ion-img src="{{ avatarKey() | avatar | async }}" alt="Avatar icon" />
          </ion-avatar>
          <ion-label>{{fullName()}}</ion-label>
        }
        @if(!isReadOnly()) {
          <ion-label>
            <ion-button slot="start" fill="clear" (click)="selectClicked.emit()">{{ selectLabel() | translate | async }}</ion-button>
          </ion-label>
        }
      </ion-item>
      <ion-item lines="none">
        <ion-note>{{ note() | translate | async }}</ion-note>
      </ion-item>
    </ion-card-content>
  </ion-card>
  `,
})
export class AvatarSelectComponent {
  // inputs
  public avatar = input<AvatarInfo | undefined>();    // if undefined, no avatar is shown
  public name = input.required<string>();
  public color = input<ColorIonic>(ColorIonic.White);
  public selectLabel = input('@general.operation.select.label');
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // output signals
  public selectClicked = output<void>();

  // derived 
  protected avatarKey = computed(() => this.avatar()?.modelType + '.' + this.avatar()?.key);
  protected fullName = computed(() => this.avatar()?.name1 + ' ' + this.avatar()?.name2);
  protected headerTitle = computed(() =>`@task.field.${this.name()}.label`);
  protected note = computed(() =>`@task.field.${this.name()}.description`);

  // passing constants to the template
  protected colorsIonic = ColorsIonic;
}
