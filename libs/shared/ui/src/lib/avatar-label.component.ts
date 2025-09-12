import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonAvatar, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';

import { AvatarService } from '@bk2/avatar-data-access';

@Component({
  selector: 'bk-avatar-label',
  standalone: true,
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
  private readonly avatarService = inject(AvatarService);

  public label = input('');
  public color = input<ColorIonic>(ColorIonic.White);
  public alt = input('Avatar Logo');
  public key = input.required<string>();    // modelType.modelKey, e.g. 15.1123123asdf

  private readonly urlRef = rxResource({
    params: () => ({
      key: this.key()
    }),
    stream: ({ params }) => this.avatarService.getAvatarImgixUrl(params.key)
  });
  public url = computed(() => this.urlRef.value() ?? '');

  protected colorsIonic = ColorsIonic;
}

