import { Component, computed, inject, input } from "@angular/core";
import { IonAvatar, IonImg, IonLabel } from "@ionic/angular/standalone";
import { rxResource } from "@angular/core/rxjs-interop";

import { AvatarCollection, AvatarModel, PersonModelName, UserModel } from "@bk2/shared-models";
import { coerceBoolean, getFullName } from "@bk2/shared-util-core";
import { FirestoreService } from '@bk2/shared-data-access';
import { addImgixParams } from '@bk2/shared-util-core';
import { ENV } from "@bk2/shared-config";
import { navigateByUrl } from "@bk2/shared-util-angular";
import { Router } from "@angular/router";


@Component({
  selector: 'bk-avatar-user',
  standalone: true,
  imports: [
    IonAvatar, IonLabel, IonImg
  ],
  styles: [`
    ion-avatar { margin: auto; height: 60px; width: 60px; padding: 10px; text-align: right; position: relative; }
    `],
  template: `
    @if(currentUser(); as currentUser) {
        <ion-avatar (click)="showProfile()">
          <ion-img [src]="avatarUrl()" alt="Avatar of the current user" />
        </ion-avatar>
        @if (shouldShowName()) {
          <ion-label><small>{{ userName() }}</small></ion-label>
        }
    }
  `
})
export class AvatarUserComponent {
  private firestoreService = inject(FirestoreService);
  private env = inject(ENV);
  private router = inject(Router);

  // inputs
  public currentUser = input<UserModel | undefined>();
  public showName = input(false);

  // computed
  protected shouldShowName = computed(() => coerceBoolean(this.showName()));
  protected avatarKey = computed(() => `${PersonModelName}.${this.currentUser()?.personKey}`);
  protected userName = computed(() => getFullName(this.currentUser()?.firstName, this.currentUser()?.lastName, this.currentUser()?.nameDisplay));

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
    return avatar ? `${imgixBaseUrl}/${addImgixParams(avatar.storagePath, 60)}` : `${imgixBaseUrl}/logo/icons/${PersonModelName}.svg`;
  });

  protected async showProfile(): Promise<void> {
    await navigateByUrl(this.router, '/person/profile');
  }
}
