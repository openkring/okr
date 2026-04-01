import { Component, computed, input, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonImg, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ColorsIonic } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-avatar-select',
  standalone: true,
  imports: [
    AsyncPipe, CategoryPlainNamePipe, TranslatePipe, AvatarPipe, SvgIconPipe,
    IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonNote, IonIcon
  ],
  template: `
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ headerTitle() | translate | async }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
        @if(clearable() && avatar()) {
          <ion-icon src="{{'cancel' | svgIcon}}" slot="start" (click)="clearClicked.emit()"/>
        }
        @if(avatar()) {
          <ion-avatar slot="start">
            <ion-img src="{{ avatarKey() | avatar }}" alt="Avatar icon" />
          </ion-avatar>
          <ion-label>{{fullName()}}</ion-label>
        }
        @if(!isReadOnly()) {
            <ion-button slot="end" fill="clear" (click)="selectClicked.emit()">{{ selectLabel() | translate | async }}</ion-button>
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
  public prefix = input('@task.field');
  public selectLabel = input('@general.operation.select.label');
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public clearable = input<boolean>(false);

  // output signals
  public selectClicked = output<void>();
  public clearClicked = output<void>();

  // derived 
  protected avatarKey = computed(() => this.avatar()?.modelType + '.' + this.avatar()?.key);
  protected fullName = computed(() => this.avatar()?.name1 + ' ' + this.avatar()?.name2);
  protected headerTitle = computed(() =>`${this.prefix()}.${this.name()}.label`);
  protected note = computed(() =>`${this.prefix()}.${this.name()}.description`);

  // passing constants to the template
  protected colorsIonic = ColorsIonic;
}
