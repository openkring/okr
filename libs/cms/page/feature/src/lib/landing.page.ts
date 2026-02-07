import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonButton, IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';

import { PageStore } from './page.store';
import { DEFAULT_BANNER_URL } from '@bk2/shared-constants';

/**
 * LandingPage is a page that greets users when they visit the application.
 * It displays a logo, title, subtitle, and a login button if the user is not authenticated.
 * The page also includes a background image and help text for user assistance.
 */
@Component({
  selector: 'bk-landing-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonContent, IonButton, IonIcon, IonImg, IonLabel,
    IonGrid, IonRow, IonCol,
    HeaderComponent
  ],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
    
    ion-content {
      --background: transparent;
    }

    .landing-container { 
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
.landing-form {
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
.help { text-align: center; font-size: 1rem; }
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
    <bk-header [title]="title()" [isRoot]="true" />
    <ion-content>
      <div class="landing-container">
        <img class="background-image" [src]="bannerUrl()" alt="Background" />
        <ion-grid class="landing-form">
          @if(logoUrl(); as logoUrl) {
            <ion-row>
              <ion-col>
                <ion-img class="logo" [src]="logoUrl" alt="{{ logoAltText() }}" (click)="gotoHome()" />
              </ion-col>
            </ion-row>
          }
          <ion-row>
            <ion-col>
              <ion-label class="title"><strong>{{ title() | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
          <ion-row class="ion-hide-md-down">
            <ion-col>
              <ion-label class="subtitle">{{ subTitle() | translate | async }}</ion-label><br />
            </ion-col>
          </ion-row>
          @if (isAuthenticated() === false) {
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
                {{ abstract() | translate | async }}
              </ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>
    </ion-content>
  `
})
export class LandingPage {
  private readonly pageStore = inject(PageStore);

  protected page = computed(() => this.pageStore.page());
  protected title = computed (() => this.page()?.title ?? 'Title missing');
  protected subTitle = computed (() => this.page()?.subTitle ?? 'Subtitle missing');
  protected abstract = computed (() => this.page()?.abstract);
  protected logoUrl = computed (() => this.pageStore.getImgixUrl(this.page()?.logoUrl));
  protected logoAltText = computed(() => this.page()?.logoAltText || `${this.pageStore.tenantId()} Logo`);
  protected bannerUrl = computed(() => this.pageStore.getImgixUrl(this.page()?.bannerUrl || DEFAULT_BANNER_URL));
  protected bannerAltText = computed(() => this.page()?.bannerAltText || `${this.pageStore.tenantId()} Banner`);
  protected isAuthenticated = computed(() => this.pageStore.appStore.isAuthenticated());

  protected async gotoHome(): Promise<void> {
    await this.pageStore.navigateByUrl(this.pageStore.getConfigAttribute('rootUrl') + '');
  }

  protected async login(): Promise<void> {
    await this.pageStore.navigateByUrl(this.pageStore.getConfigAttribute('loginUrl') + '');
  }
}
