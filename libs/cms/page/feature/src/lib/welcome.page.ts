import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getImgixUrlWithAutoParams } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-welcome-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonContent, IonButton, IonIcon, IonImg, IonLabel,
    IonGrid, IonRow, IonCol,
    HeaderComponent
  ],
  styles: [`
    .welcome-container { 
    display: flex; 
    align-items: center;
  justify-content: center;
  height: 100%;
}

.background-image {
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

.welcome-form {
  padding: 20px;
  border-radius: 10px;
  width: 600px;
  max-width: 600px;
  width: 90%;
  text-align: center;
  z-index: 5;
}

.title {
  text-align: center;
  font-size: 2rem;
}

.subtitle {
  text-align: center;
  font-size: 1.2rem;
}

.help {
  text-align: center;
  font-size: 1rem;
}

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
    <bk-header title="{{ '@cms.welcome.header' | translate | async }}" [isRoot]="true" />
    <ion-content>
      <div class="welcome-container">
        <img class="background-image" [src]="backgroundImageUrl()" alt="Background" />
        <ion-grid class="welcome-form">
          <ion-row>
            <ion-col>
              <ion-img class="logo" [src]="logoUrl()" alt="{{ logoAlt() }}" (click)="gotoHome()" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col>
              <ion-label class="title"><strong>{{ '@cms.welcome.title' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
          <ion-row class="ion-hide-md-down">
            <ion-col>
              <ion-label class="subtitle">{{ '@cms.welcome.subTitle' | translate | async }}</ion-label><br />
            </ion-col>
          </ion-row>
          @if (appStore.isAuthenticated() === false) {
            <br />
            <ion-row>
              <ion-col>
                <ion-button (click)="login()">Login</ion-button><br />
              </ion-col>
            </ion-row>
          }
          <ion-row class="ion-hide-md-down">
            <ion-col color="light">
              <ion-label class="help">
                <ion-icon src="{{'info-circle' | svgIcon }}" slot="start" />
                {{ '@cms.welcome.help' | translate | async }}
              </ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>
    </ion-content>
  `
})
export class BkWelcomePageComponent {
  private readonly router = inject(Router);
  public appStore = inject(AppStore);

  public logoUrl = computed (() => {
    return `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().logoUrl)}`;
  });
  public backgroundImageUrl = computed(() => {
    return `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().welcomeBannerUrl)}`;
  });
  public logoAlt = computed(() => `${this.appStore.tenantId()} Logo`);

  public async gotoHome(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().rootUrl);
  }

  public async login(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().loginUrl);
  }
}
