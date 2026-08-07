import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonItem, IonLabel, IonList, IonToggle,
} from '@ionic/angular/standalone';

import { ConsentService } from '@okr/consent-data-access';
import { I18nService } from '@okr/shared-i18n';

import { CONSENT_I18N_KEYS, ConsentI18n } from './consent-i18n';

@Component({
  selector: 'okr-cookie-banner',
  standalone: true,
  imports: [FormsModule, IonButton, IonItem, IonLabel, IonList, IonToggle],
  styles: [`
    .cookie-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      background: var(--ion-background-color, #fff);
      border-top: 2px solid var(--ion-color-medium, #92949c);
      padding: 16px;
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.18);
    }
    .banner-text {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.5;
    }
    .banner-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .banner-actions ion-button {
      flex: 1 1 auto;
      min-width: 140px;
    }
    .preferences-section {
      margin-top: 12px;
      border-top: 1px solid var(--ion-border-color, #e0e0e0);
      padding-top: 8px;
    }
  `],
  template: `
    @if (needsBanner()) {
      <div class="cookie-banner" role="dialog" [attr.aria-label]="i18n.banner_aria()" aria-live="polite">
        <p class="banner-text">{{ i18n.banner_text() }}</p>

        <div class="banner-actions">
          <ion-button expand="block" color="primary" (click)="acceptAll()">
            {{ i18n.banner_acceptAll() }}
          </ion-button>
          <ion-button expand="block" color="primary" fill="outline" (click)="rejectAll()">
            {{ i18n.banner_rejectAll() }}
          </ion-button>
          <ion-button expand="block" color="medium" fill="outline" (click)="toggleCustomize()">
            {{ i18n.banner_customize() }}
          </ion-button>
        </div>

        @if (showCustomize()) {
          <div class="preferences-section">
            <ion-list lines="none">
              <ion-item>
                <ion-label>
                  <h3>{{ i18n.necessary_title() }}</h3>
                  <p>{{ i18n.necessary_description() }}</p>
                </ion-label>
                <ion-toggle [checked]="true" [disabled]="true" slot="end" />
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ i18n.analytics_title() }}</h3>
                  <p>{{ i18n.analytics_description() }}</p>
                </ion-label>
                <ion-toggle
                  [checked]="analyticsToggle()"
                  (ionChange)="analyticsToggle.set($event.detail.checked)"
                  slot="end"
                />
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ i18n.marketing_title() }}</h3>
                  <p>{{ i18n.marketing_description() }}</p>
                </ion-label>
                <ion-toggle
                  [checked]="marketingToggle()"
                  (ionChange)="marketingToggle.set($event.detail.checked)"
                  slot="end"
                />
              </ion-item>
            </ion-list>
            <ion-button expand="block" color="primary" (click)="saveCustom()">
              {{ i18n.banner_save() }}
            </ion-button>
          </div>
        }
      </div>
    }
  `,
})
export class CookieBanner {
  private readonly consentService = inject(ConsentService);

  protected readonly i18n = inject(I18nService).translateAll(CONSENT_I18N_KEYS) as ConsentI18n;

  protected readonly needsBanner = toSignal(
    this.consentService.consent$.pipe(map(s => !s.decided)),
    { initialValue: true },
  );
  protected readonly showCustomize = signal(false);
  protected readonly analyticsToggle = signal(false);
  protected readonly marketingToggle = signal(false);

  protected acceptAll(): void {
    this.consentService.acceptAll();
    this.showCustomize.set(false);
  }

  protected rejectAll(): void {
    this.consentService.rejectAll();
    this.showCustomize.set(false);
  }

  protected toggleCustomize(): void {
    const opening = !this.showCustomize();
    if (opening) {
      const state = this.consentService.getState();
      this.analyticsToggle.set(state.analytics);
      this.marketingToggle.set(state.marketing);
    }
    this.showCustomize.set(opening);
  }

  protected saveCustom(): void {
    this.consentService.setCustom({
      analytics: this.analyticsToggle(),
      marketing: this.marketingToggle(),
    });
    this.showCustomize.set(false);
  }
}
