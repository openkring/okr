import { Component, computed, effect, inject, input, Signal } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonIcon, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { DEFAULT_BANNER_URL } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { PageStore } from './page.store';
import { PFX } from './scope';

/** maps the route/dispatcher error name to the i18n block that holds its texts */
const ERROR_I18N_BLOCK: Record<string, string> = {
  notfound: 'notfound',
  pageNotFound: 'notfound',
  unknownPageType: 'unknownpagetype',
};

/**
 * ErrorPage is a simple component that displays a user-friendly error message.
 * Currently, it is used to display a "Not Found" message when a user navigates to a non-existent page.
 * Later, we will extend it to handle other error types (500, 403, etc.).
 * 
 * The component displays a background image, logo, title, subtitle, and help text.
 */
@Component({
  selector: 'okr-error-page',
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
    <okr-header [i18n]="{ title: title() }" [showCloseButton]="false" />
    <ion-content>
      <div class="error-container">
        <img class="error-image" [src]="bannerUrl()" alt="Background" />
        <ion-grid class="error-form">
          @if (logoUrl(); as logoUrl) {
            <ion-row>
              <ion-col>
                <ion-img class="logo" [src]="logoUrl" (click)="gotoHome()" alt="{{ logoAltText() }}" />
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

  protected title = this.text('title');
  protected subTitle = this.text('subTitle');
  protected abstract = this.text('abstract');
  protected logoAltText = this.text('logoAltText');
  protected bannerAltText = this.text('bannerAltText');

  protected page = computed(() => this.store.page());
  // the error page is reached exactly when no page doc could be resolved, so it must not depend on
  // one: app-config carries a per-tenant logo and not-found banner. tenant/default/app/banner.jpg
  // does not exist in the bucket, it is only the last resort before an empty src.
  protected logoUrl = computed(() => this.store.getImgixUrl(this.page()?.logoUrl || this.store.getConfigAttribute('logoUrl')) ?? '');
  protected bannerUrl = computed(() => this.store.getImgixUrl(
    this.page()?.bannerUrl || this.store.getConfigAttribute('notfoundBannerUrl') || DEFAULT_BANNER_URL));

  constructor() {
    effect(() => {
      this.store.setPageId(this.errorName());
    });
  }

  /**
   * Resolve one text field of the error page.
   *
   * The error page is shown exactly when a page could not be resolved, so a tenant-owned page doc
   * is the exception, not the rule — without a fallback every tenant but the one owning the doc
   * renders an empty 404. So fall back to this lib's own `<errorBlock>.<field>` key, which every
   * tenant has: creating a pageNotFound_<tenantId> doc per tenant is not required, it only
   * overrides. A doc value is either a full '@scope.key' or plain text (I18nService.translate
   * passes non-'@' values through verbatim).
   */
  private text(field: 'title' | 'subTitle' | 'abstract' | 'logoAltText' | 'bannerAltText'): Signal<string> {
    return toSignal(
      toObservable(computed(() => this.store.page()?.[field] || `${PFX}${ERROR_I18N_BLOCK[this.errorName()] ?? 'notfound'}.${field}`)).pipe(
        switchMap(key => this.i18nService.translate(key))
      ),
      { initialValue: '' }
    );
  }

  protected async gotoHome(): Promise<void> {
    await this.store.navigateByUrl(this.store.getConfigAttribute('rootUrl') + '');
  }
}
