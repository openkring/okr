import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';
import { rxResource } from '@angular/core/rxjs-interop';

import { ColorsIonic } from '@bk2/shared/categories';
import { CategoryPlainNamePipe, getAvatarImgixUrl } from '@bk2/shared/pipes';
import { ColorIonic } from '@bk2/shared/models';
import { ENV, FIRESTORE} from '@bk2/shared/config';
import { THUMBNAIL_SIZE } from '@bk2/shared/constants';

@Component({
  selector: 'bk-avatar-label',
  imports: [
    CategoryPlainNamePipe,
    IonItem, IonAvatar, IonImg, IonLabel
  ],
  template: `
  <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
    <ion-avatar slot="start">
      <ion-img [src]="url()" [alt]="alt()" />
    </ion-avatar>
    <ion-label>{{label()}}</ion-label>      
  </ion-item>
  `,
})
export class AvatarLabelComponent {
  private readonly firestore = inject(FIRESTORE);
  private readonly env = inject(ENV);

  public label = input('');
  public color = input<ColorIonic>(ColorIonic.White);
  public alt = input('Avatar Logo');
  public key = input.required<string>();    // modelType.modelKey, e.g. 15.1123123asdf

  private readonly urlRef = rxResource({
    request: () => ({
      key: this.key()
    }),
    loader: ({request}) => getAvatarImgixUrl(this.firestore, request.key, THUMBNAIL_SIZE, this.env.services.imgixBaseUrl)
  });
  public url = computed(() => this.urlRef.value() ?? '');

  protected colorsIonic = ColorsIonic;
}

