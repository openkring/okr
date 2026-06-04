import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { Header } from '@bk2/shared-ui';
import { DEFAULT_BANNER_URL } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { PageStore } from './page.store';
import { PFX } from './scope';

/**
 * ErrorPage is a simple component that displays a user-friendly error message.
 * Currently, it is used to display a "Not Found" message when a user navigates to a non-existent page.
 * Later, we will extend it to handle other error types (500, 403, etc.).
 * 
 * The component displays a background image, logo, title, subtitle, and help text.
 */
@Component({
  selector: 'bk-error-page',
  standalone: true,
  providers: [PageStore],
  imports: [
    SvgIconPipe,
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonIcon, IonImg
  ],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }

    .error-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    .error-image {
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
    .error-form {
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
    <bk-header [i18n]="{ title: title() }" [showCloseButton]="false" />
    <ion-content>
      <div class="error-container">
        <img class="error-image" [src]="bannerUrl()" alt="Background" />
        <ion-grid class="error-form">
          <ion-row>
            <ion-col>
              <ion-img class="logo" [src]="logoUrl()" (click)="gotoHome()" alt="{{ logoAltText() }}" />
            </ion-col>
          </ion-row>
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
export class ErrorPage {
  private readonly store = inject(PageStore);
  private readonly i18nService = inject(I18nService);

  public readonly errorName = input('notfound');

  protected title = toSignal(
    toObservable(computed(() => this.store.page()?.title)).pipe(
      switchMap(key => this.i18nService.translate(key ? PFX + key : undefined))
    ),
    { initialValue: '' }
  );

  protected subTitle = toSignal(
    toObservable(computed(() => this.store.page()?.subTitle)).pipe(
      switchMap(key => this.i18nService.translate(key ? PFX + key : undefined))
    ),
    { initialValue: '' }
  );

  protected abstract = toSignal(
    toObservable(computed(() => this.store.page()?.abstract)).pipe(
      switchMap(key => this.i18nService.translate(key ? PFX + key : undefined))
    ),
    { initialValue: '' }
  );

  protected logoAltText = toSignal(
    toObservable(computed(() => this.store.page()?.logoAltText)).pipe(
      switchMap(key => this.i18nService.translate(key ? PFX + key : `${this.store.tenantId()} Logo`))
    ),
    { initialValue: '' }
  );

  protected bannerAltText = toSignal(
    toObservable(computed(() => this.store.page()?.bannerAltText)).pipe(
      switchMap(key => this.i18nService.translate(key ? PFX + key : `${this.store.tenantId()} Banner`))
    ),
    { initialValue: '' }
  );

  protected page = computed(() => this.store.page());
  protected logoUrl = computed(() => this.store.getImgixUrl(this.page()?.logoUrl) ?? '');
  protected bannerUrl = computed(() => this.store.getImgixUrl(this.page()?.bannerUrl || DEFAULT_BANNER_URL));

  constructor() {
    effect(() => {
      this.store.setPageId(this.errorName());
    });
  }

  protected async gotoHome(): Promise<void> {
    await this.store.navigateByUrl(this.store.getConfigAttribute('rootUrl') + '');
  }
}
