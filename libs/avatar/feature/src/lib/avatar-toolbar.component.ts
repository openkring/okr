import { Component, effect, inject, input, output } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAvatar, IonIcon, IonImg, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AvatarToolbarStore } from './avatar-toolbar.store';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'bk-avatar-toolbar',
  standalone: true,
  imports: [
    SvgIconPipe, JsonPipe,
    IonToolbar, IonAvatar, IonImg, IonTitle, IonIcon, IonItem, IonLabel
  ],
  providers: [AvatarToolbarStore],
  styles: [
    `
      ion-avatar { margin: auto; height: 100px; width: 100px; padding: 10px; text-align: right; position: relative; }
      ion-title { margin: auto; width: 100%; text-align: center; }
      ion-label { margin: auto; width: 100%; text-align: center; }
      ion-icon { font-size: 24px; position: absolute; bottom: 12px; right: 12px; }
    `,
  ],
  template: `
    <ion-toolbar>
      <ion-avatar (click)="editImage()">
        <ion-img [src]="avatarToolbarStore.url()" [alt]="alt()" />
        @if(readOnly() === false) {
          <ion-icon src="{{ 'camera' | svgIcon }}" />
        }
      </ion-avatar>

      @if(title()) {
        <ion-item lines="none">
          <ion-title (click)="avatarToolbarStore.showZoomedImage()">{{ title() }}</ion-title>
        </ion-item>
      }
      @if(subTitle(); as subTitle) {
        <ion-item lines="none">
          @if(subTitle.startsWith('tel:')) {
            <ion-label><small><a href="{{ subTitle }}">{{ subTitle.substring(4) }}</a></small></ion-label>
          } @else if(subTitle.startsWith('mailto:')) {
            <ion-label><small><a href="{{ subTitle }}">{{ subTitle.substring(7) }}</a></small></ion-label>
          } @else {
            <ion-label><small>{{ subTitle }}</small></ion-label>
          }
        </ion-item>
      }
    </ion-toolbar>
  `
})
export class AvatarToolbarComponent {
  protected avatarToolbarStore = inject(AvatarToolbarStore);

  public key = input.required<string>(); // = ModelType.ModelKey e.g. person.1asdfölj
  public readOnly = input(true);
  public alt = input('Avatar');
  public color = input<ColorIonic>(ColorIonic.Light);
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>(); // if subTitle starts with tel: or mailto: a href link is created
  public modelType = input.required<'person' | 'org' | 'group'>();

  public imageSelected = output<Photo>();

  protected colorsIonic = ColorsIonic;

  constructor() {
    effect(() => {
      this.avatarToolbarStore.setKey(this.key());
      this.avatarToolbarStore.setModelType(this.modelType());
    });
  }

  public async editImage(): Promise<void> {
    if (this.readOnly() === true) {
      this.avatarToolbarStore.showZoomedImage(this.title()); // zoom the avatar image to show it bigger
    } else {
      const photo = await this.avatarToolbarStore.uploadPhoto();

      if (photo) {
        this.imageSelected.emit(photo);
      }
    }
  }
}
