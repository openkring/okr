import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-page-not-found',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonIcon, IonImg
  ],
  styles: [`
    .notfound-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    .notfound-image {
      filter: blur(8px);
      -webkit-filter: blur(8px);
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.7;
      z-index: 1;
    }
    .notfound-form {
      padding: 20px;
      border-radius: 10px;
      width: 600px;
      max-width: 600px;
      width: 90%;
      text-align: center;
      z-index: 5;
    }
    .title { text-align: center; font-size: 2rem; }
    .subtitle { text-align: center; font-size: 1.2rem; }
    .help {  text-align: center;  font-size: 1rem; }
    .logo, ion-button {
      max-width: 150px;
      text-align: center;
      display: block;
      margin-left: auto;
      margin-right: auto;
      width: 50%;
      z-index: 10;
    }
  `],
  template: `
    <bk-header title="@cms.notfound.title" [showCloseButton]="false" />
    <ion-content>
      <div class="notfound-container">
        <img class="notfound-image" [src]="backgroundImageUrl()" alt="Background" />
        <ion-grid class="notfound-form">
          <ion-row>
            <ion-col>
              <ion-img class="logo" [src]="logoUrl()" (click)="gotoHome()" alt="{{ logoAlt() }}" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col>
              <ion-label class="title"><strong>{{ '@cms.notfound.title' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
          <ion-row class="ion-hide-md-down">
            <ion-col>
              <ion-label class="subtitle">{{ '@cms.notfound.subTitle' | translate | async }}</ion-label><br />
            </ion-col>
          </ion-row>
          <ion-row class="ion-hide-md-down">
            <ion-col color="light">
              <ion-label class="help">
                <ion-icon src="{{'info-circle' | svgIcon }}" slot="start" />
                {{ '@cms.notfound.help' | translate | async }}
              </ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>
    </ion-content>
  `
})
export class PageNotFoundComponent {
  private readonly pageStore = inject(PageStore);

  protected logoUrl = computed (() => this.pageStore.getImgixUrl('logoUrl'));
  protected backgroundImageUrl = computed(() => this.pageStore.getImgixUrl('notfoundBannerUrl'));
  protected logoAlt = computed(() => `${this.pageStore.tenantId()} Logo`);

  protected async gotoHome(): Promise<void> {
    await this.pageStore.navigateByUrl(this.pageStore.getConfigAttribute('rootUrl') + '');
  }
}
