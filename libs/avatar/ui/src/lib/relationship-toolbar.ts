import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { IonCol, IonGrid, IonItem, IonLabel, IonRow, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';

import { AvatarInfo, CategoryListModel, ColorIonic, UserModel } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';
import { AppNavigationService, navigateByUrl } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { BkAvatar } from './avatar';

@Component({
  selector: 'bk-relationship-toolbar',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    BkAvatar,
    IonToolbar, IonItem, IonGrid, IonRow, IonCol, IonLabel
  ],
  template: `
  <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
    <ion-grid>
      <ion-row class="ion-align-items-center ion-justify-content-center">
        <ion-col size="12">
          <ion-item lines="none" class="title" [color]="color() | categoryPlainName:colorsIonic">
            <ion-label>{{ relDesc1() }}</ion-label>
          </ion-item>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="5" class="ion-align-items-center ion-justify-content-center">
          <ion-item lines="none" (click)="goto(subjectUrl())" [color]="color() | categoryPlainName:colorsIonic" class="ion-align-items-center ion-justify-content-center">
            <bk-avatar [avatarInfo]="subjectAvatar()" [types]="types()" [defaultIcon]="subDefaultIcon()" [currentUser]="currentUser()"  class="ion-align-items-center ion-justify-content-center"/>
          </ion-item>
        </ion-col>
        <ion-col size="2" class="ion-align-items-center ion-justify-content-center">
          <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
            <ion-label>{{ relDesc2() }}</ion-label>
          </ion-item>
        </ion-col>
        <ion-col size="5" class="ion-align-items-center ion-justify-content-center">
          <ion-item lines="none" (click)="goto(objectUrl())" [color]="color() | categoryPlainName:colorsIonic" class="ion-align-items-center ion-justify-content-center">
            <bk-avatar [avatarInfo]="objectAvatar()" [defaultIcon]="objDefaultIcon()" [currentUser]="currentUser()" />
          </ion-item>
        </ion-col>
      </ion-row>
    </ion-grid>
  </ion-toolbar>
  `,
  styles: [`
    ion-thumbnail { margin: auto; height: 100px; text-align: right; position: relative;}
    .title { margin: auto; width: 100%; text-align: center;  }
    ion-icon { font-size: 80px;   }
    bk-avatar { width: 100%; height: 100%; }
  `]
})
export class RelationshipToolbar {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);
  private readonly appNavigationService = inject(AppNavigationService);
  private readonly i18nService = inject(I18nService);

  // inputs
  public relType = input.required<string>();
  public subjectAvatar = input.required<AvatarInfo>();
  public types = input<CategoryListModel>();
  public objectAvatar = input.required<AvatarInfo>();
  public currentUser = input.required<UserModel>();
  public color = input<ColorIonic>(ColorIonic.Primary);
  public subjectDefaultIcon = input<string>();
  public objectDefaultIcon = input<string>();
  public readOnly = input<boolean>(false);

  // dynamic i18n: keys depend on relType input, so use toSignal + switchMap
  protected readonly relDesc1 = toSignal(
    toObservable(this.relType).pipe(switchMap(type => this.i18nService.translate('@' + type + '.reldesc1'))),
    { initialValue: '' }
  );
  protected readonly relDesc2 = toSignal(
    toObservable(this.relType).pipe(switchMap(type => this.i18nService.translate('@' + type + '.reldesc2'))),
    { initialValue: '' }
  );

  // passing constants to the template
  protected colorsIonic = ColorsIonic;

  // derived signals
  protected subDefaultIcon = computed(() => this.subjectDefaultIcon() ?? this.subjectAvatar().modelType);
  protected objDefaultIcon = computed(() => this.objectDefaultIcon() ?? this.objectAvatar().modelType);
  protected subjectUrl = computed(() => `/${this.subjectAvatar().modelType}/${this.subjectAvatar().key}`);
  protected objectUrl = computed(() => `/${this.objectAvatar().modelType}/${this.objectAvatar().key}`);

  protected async goto(url: string): Promise<void> {
    if (this.readOnly() === false) {
      this.modalController.dismiss(undefined, 'cancel');
      this.appNavigationService.pushLink(`/${this.relType()}/all`);
      await navigateByUrl(this.router, url);
    }
  }
}
