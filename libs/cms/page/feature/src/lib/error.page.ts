import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';

import { PageStore } from './page.store';
import { DEFAULT_BANNER_URL } from '@bk2/shared-constants';

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
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    HeaderComponent,
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
  @if(page(); as page) {
    <bk-header [title]="title()" [showCloseButton]="false" />
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
              <ion-label class="title"><strong>{{ title() | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
          <ion-row class="ion-hide-md-down">
            <ion-col>
              <ion-label class="subtitle">{{ subTitle() | translate | async }}</ion-label><br />
            </ion-col>
          </ion-row>
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
  }
  `
})
export class ErrorPage {
  private readonly pageStore = inject(PageStore);

  public readonly errorName = input('notfound');

  protected page = computed(() => this.pageStore.page());
  protected title = computed (() => this.page()?.title ?? 'Title missing');
  protected subTitle = computed (() => this.page()?.subTitle ?? 'Subtitle missing');
  protected abstract = computed (() => this.page()?.abstract);
  protected logoUrl = computed (() => this.pageStore.getImgixUrl(this.page()?.logoUrl));
  protected logoAltText = computed(() => this.page()?.logoAltText || `${this.pageStore.tenantId()} Logo`);
  protected bannerUrl = computed(() => this.pageStore.getImgixUrl(this.page()?.bannerUrl || DEFAULT_BANNER_URL));
  protected bannerAltText = computed(() => this.page()?.bannerAltText || `${this.pageStore.tenantId()} Banner`);

  constructor() {
    effect(() => {
      this.pageStore.setPageId(this.errorName());
    });
  }

  protected async gotoHome(): Promise<void> {
    await this.pageStore.navigateByUrl(this.pageStore.getConfigAttribute('rootUrl') + '');
  }
}
