import { Component, effect, inject, input, output } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAvatar, IonIcon, IonImg, IonItem, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';

import { AvatarToolbarStore } from './avatar-toolbar.store';

@Component({
  selector: 'bk-avatar-toolbar',
  standalone: true,
  imports: [CategoryPlainNamePipe, SvgIconPipe, IonToolbar, IonAvatar, IonImg, IonTitle, IonIcon, IonItem],
  providers: [AvatarToolbarStore],
  template: `
    <ion-toolbar [color]="color() | categoryPlainName : colorsIonic">
      <ion-avatar (click)="editImage()">
        <ion-img [src]="avatarToolbarStore.url()" [alt]="alt()" />
        @if(isEditable()) {
        <ion-icon src="{{ 'camera' | svgIcon }}" />
        }
      </ion-avatar>

      @if(title()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:0px !important;" (click)="avatarToolbarStore.showZoomedImage()">{{ title() }}</ion-title>
      </ion-item>
      } @if(subTitle()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:0px !important;"
          ><small>{{ subTitle() }}</small></ion-title
        >
      </ion-item>
      }
    </ion-toolbar>
  `,
  styles: [
    `
      ion-avatar {
        margin: auto;
        height: 100px;
        width: 100px;
        padding: 10px;
        text-align: right;
        position: relative;
      }
      ion-title {
        margin: auto;
        width: 100%;
        text-align: center;
        padding: 10px;
      }
      ion-icon {
        font-size: 24px;
        position: absolute;
        bottom: 12px;
        right: 12px;
      }
    `,
  ],
})
export class AvatarToolbarComponent {
  protected avatarToolbarStore = inject(AvatarToolbarStore);

  public key = input.required<string>(); // = ModelType.ModelKey e.g. 1.1asdfölj
  public isEditable = input<boolean>(false);
  public alt = input('Avatar');
  public color = input<ColorIonic>(ColorIonic.Primary);
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();

  public imageSelected = output<Photo>();

  protected colorsIonic = ColorsIonic;

  constructor() {
    effect(() => {
      this.avatarToolbarStore.setKey(this.key());
    });
  }

  public async editImage(): Promise<void> {
    if (this.isEditable() === false) {
      this.avatarToolbarStore.showZoomedImage(this.title()); // zoom the avatar image to show it bigger
    } else {
      const _photo = await this.avatarToolbarStore.uploadPhoto();

      if (_photo) {
        this.imageSelected.emit(_photo);
      }
    }
  }
}
