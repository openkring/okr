import { Component, computed, input, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonImg, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { AvatarInfo, ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-avatar-select',
  standalone: true,
  imports: [
    CategoryPlainNamePipe, AvatarPipe, SvgIconPipe,
    IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonNote, IonIcon
  ],
  template: `
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ title() }}</ion-card-title>
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
            <ion-button slot="end" fill="clear" (click)="selectClicked.emit()">{{ selectLabel() }}</ion-button>
        }
      </ion-item>
      <ion-item lines="none">
        <ion-note>{{ note() }}</ion-note>
      </ion-item>
    </ion-card-content>
  </ion-card>
  `,
})
export class AvatarSelect {
  // inputs
  public avatar = input<AvatarInfo | undefined>();    // if undefined, no avatar is shown
  public name = input.required<string>();
  public color = input<ColorIonic>(ColorIonic.White);
  public selectLabel = input<string>('select');
  public title = input<string>('title');
  public note = input<string>('note');
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public clearable = input<boolean>(false);

  // output signals
  public selectClicked = output<void>();
  public clearClicked = output<void>();  

  // derived 
  protected avatarKey = computed(() => this.avatar()?.modelType + '.' + this.avatar()?.key);
  protected fullName = computed(() => this.avatar()?.name1 + ' ' + this.avatar()?.name2);

  // passing constants to the template
  protected colorsIonic = ColorsIonic;
}
