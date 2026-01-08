import { Component, computed, inject, input } from "@angular/core";
import { IonAvatar, IonIcon, IonImg, IonLabel } from "@ionic/angular/standalone";
import { rxResource } from "@angular/core/rxjs-interop";

import { AvatarCollection, AvatarInfo, AvatarModel, CategoryListModel, ResourceModelName, UserModel } from "@bk2/shared-models";
import { coerceBoolean, getFullName, addImgixParams, getCategoryIcon } from "@bk2/shared-util-core";
import { FirestoreService } from '@bk2/shared-data-access';
import { ENV } from "@bk2/shared-config";

@Component({
  selector: 'bk-avatar',
  standalone: true,
  imports: [
    IonAvatar, IonIcon, IonImg, IonLabel
  ],
  styles: [`
    ion-avatar { margin: auto; height: 60px; width: 60px; padding: 10px; text-align: right; position: relative; }
    ion-avatar img { filter: brightness(0) invert(1);}
    small { text-align: center; display: block; margin-top: 2px; }
  `],
  template: `
    @if (avatarUrl(); as url) {
      @if (useIcon()) {
        <ion-avatar>
          <ion-icon [src]="url" size="large" />
        </ion-avatar>
      } @else {
        <ion-avatar>
          <ion-img [src]="url" alt="Avatar of {{ name() }}" />
        </ion-avatar>
      }
    }

    @if (shouldShowName()) {
      <ion-label class="ion-align-items-center ion-justify-content-center">
        <small>{{ name() }}</small>
      </ion-label>
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
  public types = input<CategoryListModel>();

  // computed
  protected shouldShowName = computed(() => coerceBoolean(this.showName()));
  protected avatarKey = computed(() => `${this.avatarInfo()?.modelType}.${this.avatarInfo()?.key}`);
  protected name = computed(() => getFullName(this.avatarInfo()?.name1, this.avatarInfo()?.name2, this.currentUser()?.nameDisplay));
  protected modelType = computed(() => this.avatarInfo()?.modelType);
  protected type = computed(() => this.avatarInfo()?.type);

  private readonly avatarRef = rxResource({
    params: () => ({
      key: this.avatarKey()
    }),
    stream: ({ params }) => this.firestoreService.readModel<AvatarModel>(AvatarCollection, params.key)
  });
  private avatar = computed(() => this.avatarRef.value());
  protected useIcon = computed(() => this.avatar() ? false : true);

  public avatarUrl = computed(() => {
    const imgixBaseUrl = this.env.services.imgixBaseUrl;
    const avatar = this.avatar();
    if (avatar) {
      console.log('avatar found', avatar);
      return `${imgixBaseUrl}/${addImgixParams(avatar.storagePath, 60)}`;
    } else {
      if (this.modelType() === ResourceModelName && this.avatarInfo().type) {
        console.log('subtype avatar', this.type());
        const icon = getCategoryIcon(this.types(), this.type());
        return `${imgixBaseUrl}/logo/icons/${icon}.svg`;
      } else {
        console.log('default avatar', this.modelType());
        return `${imgixBaseUrl}/logo/icons/${this.modelType()}.svg`
      }
    }
  });
}

