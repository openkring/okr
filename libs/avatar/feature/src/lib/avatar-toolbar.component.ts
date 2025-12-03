import { Component, effect, inject, input, output } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAvatar, IonIcon, IonImg, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';

import { AvatarToolbarStore } from './avatar-toolbar.store';

@Component({
  selector: 'bk-avatar-toolbar',
  standalone: true,
  imports: [CategoryPlainNamePipe, SvgIconPipe, IonToolbar, IonAvatar, IonImg, IonTitle, IonIcon, IonItem, IonLabel],
  providers: [AvatarToolbarStore],
  template: `
    <ion-toolbar [color]="color() | categoryPlainName : colorsIonic">
      <ion-avatar (click)="editImage()">
        <ion-img [src]="avatarToolbarStore.url()" [alt]="alt()" />
        @if(readOnly() === false) {
          <ion-icon src="{{ 'camera' | svgIcon }}" />
        }
      </ion-avatar>

      @if(title()) {
        <ion-item [color]="color() | categoryPlainName : colorsIonic" lines="none">
          <ion-title (click)="avatarToolbarStore.showZoomedImage()">{{ title() }}</ion-title>
        </ion-item>
      }
      @if(subTitle()) {
        <ion-item [color]="color() | categoryPlainName : colorsIonic" lines="none">
          <ion-label><small>{{ subTitle() }}</small></ion-label>
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
      }
      ion-label { margin: auto; width: 100%; text-align: center; }
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

  public key = input.required<string>(); // = ModelType.ModelKey e.g. person.1asdfölj
  public readOnly = input(true);
  public alt = input('Avatar');
  public color = input<ColorIonic>(ColorIonic.Light);
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
