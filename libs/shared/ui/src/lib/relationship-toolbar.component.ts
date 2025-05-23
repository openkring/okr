import { Component, computed, inject, input } from '@angular/core';
import { IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { ColorsIonic } from '@bk2/shared/categories';
import { ColorIonic, ModelType } from '@bk2/shared/models';
import { HashMap } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { AppNavigationService, navigateByUrl } from '@bk2/shared/util';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-relationship-toolbar',
  imports: [
    CategoryPlainNamePipe, SvgIconPipe, TranslatePipe, AsyncPipe,
    IonToolbar, IonIcon, IonItem, IonGrid, IonRow, IonCol, IonLabel
  ],
  template: `
  <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
<!--     
    <ion-thumbnail>
      <ion-icon color="white" [src]="relationship() | svgIcon " />
    </ion-thumbnail>    
-->
  
    <ion-grid>
      <ion-row justify-content-center>
        <ion-col size="12">
          <ion-item lines="none" class="title" [color]="color() | categoryPlainName:colorsIonic">
            <ion-label>{{ '@' + relationship() + '.reldesc1' | translate | async }}</ion-label>
          </ion-item>
        </ion-col>
      </ion-row>
      <ion-row justify-content-center>
        <ion-col size="5">
          <ion-item lines="none" (click)="goto(subjectUrl())" [color]="color() | categoryPlainName:colorsIonic">
            <ion-icon [src]="subjectIcon() | svgIcon" slot="start" size="small" />
            <ion-label>{{ subjectName() }}</ion-label>
          </ion-item>
        </ion-col>
        <ion-col size="2">
          <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
            <ion-label>{{ '@' + relationship() + '.reldesc2' | translate | async }}</ion-label>
          </ion-item>
        </ion-col>
        <ion-col size="5">
          <ion-item lines="none" (click)="goto(objectUrl())" [color]="color() | categoryPlainName:colorsIonic">
            <ion-icon [src]="objectIcon() | svgIcon" slot="start" size="small" />
            <ion-label>{{ objectName() }}</ion-label>
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
  `]
})
export class RelationshipToolbarComponent {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);
  private readonly appNavigationService = inject(AppNavigationService);

  public color = input<ColorIonic>(ColorIonic.Primary);
  public titleArguments = input<HashMap>();

  protected colorsIonic = ColorsIonic;
  protected modelType = ModelType;

  protected relationship = computed(() => this.safeReadProperty(this.titleArguments(), 'relationship'));
  protected subjectName = computed(() => this.safeReadProperty(this.titleArguments(), 'subjectName'));
  protected subjectIcon = computed(() => this.safeReadProperty(this.titleArguments(), 'subjectIcon'));
  protected subjectUrl = computed(() => this.safeReadProperty(this.titleArguments(), 'subjectUrl'));
  protected objectName = computed(() => this.safeReadProperty(this.titleArguments(), 'objectName'));
  protected objectIcon = computed(() => this.safeReadProperty(this.titleArguments(), 'objectIcon'));
  protected objectUrl = computed(() => this.safeReadProperty(this.titleArguments(), 'objectUrl'));
  
  private safeReadProperty(hashmap?: HashMap, key?: string): string {
    if (!hashmap || !key) return '';
    return hashmap[key] ?? '';
  }

  protected async goto(url: string): Promise<void> {
    this.modalController.dismiss(undefined, 'cancel');
    this.appNavigationService.pushLink(`/${this.relationship()}/all`);
    await navigateByUrl(this.router, url);
  }
}
