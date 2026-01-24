import { Component, computed, inject, input } from "@angular/core";
import { IonAvatar, IonImg, IonLabel } from "@ionic/angular/standalone";

import { AvatarInfo, CategoryListModel, UserModel } from "@bk2/shared-models";
import { coerceBoolean, getFullName } from "@bk2/shared-util-core";
import { AvatarService } from '@bk2/avatar-data-access';

@Component({
  selector: 'bk-avatar',
  standalone: true,
  imports: [
    IonAvatar, IonImg, IonLabel
  ],
  styles: [`
    ion-avatar { margin: auto; height: 60px; width: 60px; padding: 10px; text-align: right; position: relative; }
    ion-avatar img { filter: brightness(0) invert(1);}
    small { text-align: center; display: block; margin-top: 2px; }
  `],
  template: `
    @if (avatarUrl(); as url) {
      <ion-avatar>
        <ion-img [src]="url" alt="Avatar of {{ name() }}" />
      </ion-avatar>
    }

    @if (shouldShowName()) {
      <ion-label class="ion-align-items-center ion-justify-content-center">
        <small>{{ name() }}</small>
      </ion-label>
    }
  `
})
export class AvatarComponent {
  private readonly avatarService = inject(AvatarService);

  // inputs
  public avatarInfo = input.required<AvatarInfo>();
  public currentUser = input.required<UserModel>();
  public showName = input(true);
  public types = input<CategoryListModel>();
  public defaultIcon = input<string>('other');

  // computed
  protected shouldShowName = computed(() => coerceBoolean(this.showName()));
  protected avatarKey = computed(() => `${this.avatarInfo()?.modelType}.${this.avatarInfo()?.key}`);
  protected name = computed(() => getFullName(this.avatarInfo()?.name1, this.avatarInfo()?.name2, this.currentUser()?.nameDisplay));
  protected modelType = computed(() => this.avatarInfo()?.modelType);

  // we need to inject AvatarService here to avoid cyclic dependency issues
  public avatarUrl = computed(() => {
    return this.avatarService.getAvatarUrl(this.avatarKey(), this.defaultIcon(), 60);
  });
}

