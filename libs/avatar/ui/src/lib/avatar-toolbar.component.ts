import { Component, computed, inject, input, output } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAvatar, IonIcon, IonImg, IonItem, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { rxResource } from '@angular/core/rxjs-interop';

import { CategoryPlainNamePipe, getAvatarImgixUrl, SvgIconPipe } from '@bk2/shared/pipes';
import { ColorsIonic } from '@bk2/shared/categories';
import { newImage } from '@bk2/cms/section/util';
import { showZoomedImage } from '@bk2/shared/ui';
import { AvatarService } from '@bk2/avatar/data';
import { ColorIonic, ImageAction } from '@bk2/shared/models';
import { ENV, FIRESTORE } from '@bk2/shared/config';

@Component({
  selector: 'bk-avatar-toolbar',
  imports: [
    CategoryPlainNamePipe, SvgIconPipe,
    IonToolbar, IonAvatar, IonImg, IonTitle, IonIcon, IonItem
  ],
  template: `
  <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
    <ion-avatar (click)="editImage()">
      <ion-img [src]="url()" [alt]="alt()" />
      @if(isEditable()) {
        <ion-icon src="{{'camera' | svgIcon }}" />
      }
    </ion-avatar>
 
    @if(title()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:0px !important;" (click)="showZoomedImage()">{{ title() }}</ion-title>
      </ion-item>
    }
    @if(subTitle()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:0px !important;"><small>{{ subTitle() }}</small></ion-title>
      </ion-item>
    }
  </ion-toolbar>
  `,
  styles: [`
    ion-avatar { margin: auto; height: 100px; width: 100px; padding: 10px; text-align: right; position: relative;}
    ion-title { margin: auto; width: 100%; text-align: center; padding: 10px; }
    ion-icon { font-size: 24px; position: absolute; bottom: 12px;  right: 12px; }
  `]
})
export class AvatarToolbarComponent {
  protected avatarService = inject(AvatarService);
  private readonly modalController = inject(ModalController);
  private readonly firestore = inject(FIRESTORE);
  private readonly env = inject(ENV);

  public key = input.required<string>();            // = ModelType.ModelKey e.g. 1.1asdfölj
  public isEditable = input<boolean>(false);
  public alt = input('Avatar');
  public color = input<ColorIonic>(ColorIonic.Primary);
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();

  private readonly urlRef = rxResource({
    request: () => ({
      key: this.key()
    }),
    loader: ({request}) => getAvatarImgixUrl(this.firestore, request.key, this.env.thumbnail.width, this.env.app.imgixBaseUrl, false)
  });
  private readonly relStorageUrl = computed(() => this.urlRef.value() ?? '');
  protected url = computed(() => (this.relStorageUrl().startsWith(this.env.app.imgixBaseUrl)) ? this.relStorageUrl() : `${this.env.app.imgixBaseUrl}/${this.urlRef.value()}`);
  public imageSelected = output<Photo>();

  protected colorsIonic = ColorsIonic;

  public async editImage(): Promise<void> {
    if (this.isEditable() === false) {  
      this.showZoomedImage();   // zoom the avatar image to show it bigger
    } else {    
      this.uploadPhoto();       // select and upload a new photo
    }
  }

  protected async showZoomedImage(): Promise<void> {
    const _url = this.relStorageUrl();
    if (_url && _url.length > 0) {
      const _image = newImage('@content.type.article.zoomedImage', _url, _url);
      _image.width = 160;
      _image.height = 83;
      _image.imageAction = ImageAction.Zoom;
      await showZoomedImage(this.modalController, this.title() ?? '', _image);
    } 
  }

  private async uploadPhoto(): Promise<void> {
    const _photo = await this.avatarService.takePhoto();

    if (_photo) {
      this.imageSelected.emit(_photo);
    } 
  }
}
