import { Component, computed, effect, inject, input } from "@angular/core";
import { IonAvatar, IonImg, IonLabel } from "@ionic/angular/standalone";
import { rxResource } from "@angular/core/rxjs-interop";

import { AvatarCollection, AvatarInfo, AvatarModel, UserModel } from "@bk2/shared-models";
import { coerceBoolean, getFullName } from "@bk2/shared-util-core";
import { FirestoreService } from '@bk2/shared-data-access';
import { addImgixParams } from '@bk2/shared-util-core';
import { ENV } from "@bk2/shared-config";


@Component({
  selector: 'bk-avatar',
  standalone: true,
  imports: [
    IonAvatar, IonLabel, IonImg
  ],
  styles: [`ion-avatar { margin: auto; height: 60px; width: 60px; padding: 10px; text-align: right; position: relative; }`],
  template: `
    <ion-avatar>
      <ion-img [src]="avatarUrl()" alt="Avatar of {{ name() }}" />
    </ion-avatar>
    @if (shouldShowName()) {
      <ion-label><small>{{ name() }}</small></ion-label>
    }
  `
})
export class AvatarComponent {
  private firestoreService = inject(FirestoreService);
  private env = inject(ENV);

  // inputs
  public avatarInfo = input.required<AvatarInfo>();
  public currentUser = input.required<UserModel>();
  public showName = input(true);

  // computed
  protected shouldShowName = computed(() => coerceBoolean(this.showName()));
  protected avatarKey = computed(() => `${this.avatarInfo()?.modelType}.${this.avatarInfo()?.key}`);
  protected name = computed(() => getFullName(this.avatarInfo()?.name1, this.avatarInfo()?.name2, this.currentUser()?.nameDisplay));

  constructor() {
    effect(() => {
      console.log('AvatarComponent avatarKey changed', this.avatarKey());
    }); 
    effect(() => {
      console.log('AvatarComponent avatarInfo changed', this.avatarInfo());
    }); 

  }

  private readonly avatarRef = rxResource({
    params: () => ({
      key: this.avatarKey()
    }),
    stream: ({ params }) => this.firestoreService.readModel<AvatarModel>(AvatarCollection, params.key)
  });
  private avatar = computed(() => this.avatarRef.value());
  public avatarUrl = computed(() => {
    const imgixBaseUrl = this.env.services.imgixBaseUrl;
    const avatar = this.avatar();
    console.log('AvatarComponent avatarUrl computed', avatar);
    return avatar ? `${imgixBaseUrl}/${addImgixParams(avatar.storagePath, 60)}` : `${imgixBaseUrl}/logo/icons/${this.avatarInfo()?.modelType}.svg`;
  });
}
