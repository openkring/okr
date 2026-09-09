import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { IonButton, IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { DEFAULT_BANNER_URL } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { PageStore } from './page.store';

/** imgix params for the blurred landing backdrop — mirrored verbatim in firebase.json (Link preload). */
export const LANDING_BANNER_IMGIX_PARAMS = 'w=1200&auto=format,compress&fit=crop';

/**
 * LandingPage is a page that greets users when they visit the application.
 * It displays a logo, title, subtitle, and a login button if the user is not authenticated.
 * The page also includes a background image and help text for user assistance.
 */
@Component({
  selector: 'okr-landing-page',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonContent, IonButton, IonIcon, IonImg, IonLabel,
    IonGrid, IonRow, IonCol,
    Header
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
/* Reserve the rows before their content arrives: the title is translated asynchronously (starts
   as '') and the logo has no intrinsic size until loaded — both used to push the grid down once
   they came in (CLS 0.038 + 0.018 measured 2026-09-09, perf-baselines.md). */
.title { text-align: center; font-size: 2rem; display: block; min-height: 2.4rem; }
.subtitle { text-align: center; font-size: 1.2rem; display: block; min-height: 1.5rem; }
.help { text-align: center; font-size: 1rem; }
.logo { aspect-ratio: 1 / 1; }
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
    <okr-header [i18n]="{ title: title() }" [isRoot]="true" />
    <ion-content>
      <div class="landing-container">
        <img class="background-image" [src]="bannerUrl()" alt="Background" fetchpriority="high" />
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
              <ion-label class="title"><strong>{{ title() }}</strong></ion-label>
            </ion-col>
          </ion-row>
          <ion-row class="ion-hide-md-down">
            <ion-col>
              <ion-label class="subtitle">{{ subTitle() }}</ion-label><br />
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
                {{ abstract() }}
              </ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>
    </ion-content>
  `
})
export class LandingPage {
  private readonly store = inject(PageStore);
  private readonly i18nService = inject(I18nService);

  protected page = computed(() => this.store.page());

  protected title = toSignal(
    toObservable(computed(() => this.store.page()?.title)).pipe(
      switchMap(key => this.i18nService.translate(key))
    ),
    { initialValue: '' }
  );

  protected subTitle = toSignal(
    toObservable(computed(() => this.store.page()?.subTitle)).pipe(
      switchMap(key => this.i18nService.translate(key))
    ),
    { initialValue: '' }
  );

  protected abstract = toSignal(
    toObservable(computed(() => this.store.page()?.abstract)).pipe(
      switchMap(key => this.i18nService.translate(key))
    ),
    { initialValue: '' }
  );

  protected logoAltText = toSignal(
    toObservable(computed(() => this.store.page()?.logoAltText)).pipe(
      switchMap(key => this.i18nService.translate(key || `${this.store.tenantId()} Logo`))
    ),
    { initialValue: '' }
  );

  protected bannerAltText = toSignal(
    toObservable(computed(() => this.store.page()?.bannerAltText)).pipe(
      switchMap(key => this.i18nService.translate(key || `${this.store.tenantId()} Banner`))
    ),
    { initialValue: '' }
  );

  protected logoUrl = computed (() => this.store.getImgixUrl(this.page()?.logoUrl));
  // The backdrop is drawn blurred (8 px) and at 70 % opacity, so the 1716×1462 original was pure
  // waste: 136 KB avif on the phone for an image nobody sees sharp. w=1200 keeps desktop covered
  // and roughly halves the bytes. Keep in sync with the Link preload header in firebase.json —
  // the preload only helps when both URLs are byte-identical.
  protected bannerUrl = computed(() => this.store.getImgixUrl(this.page()?.bannerUrl || DEFAULT_BANNER_URL, LANDING_BANNER_IMGIX_PARAMS));
  protected isAuthenticated = computed(() => this.store.appStore.isAuthenticated());

  protected async gotoHome(): Promise<void> {
    await this.store.navigateByUrl(this.store.getConfigAttribute('rootUrl') + '');
  }

  protected async login(): Promise<void> {
    await this.store.navigateByUrl(this.store.getConfigAttribute('loginUrl') + '');
  }
}
