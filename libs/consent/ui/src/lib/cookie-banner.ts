import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular';
import { TranslocoService } from '@jsverse/transloco';

import { ConsentService, cookieNoticeHash } from '@okr/consent-data-access';
import { I18nService } from '@okr/shared-i18n';

import { CONSENT_I18N_KEYS, ConsentI18n } from './consent-i18n';

/**
 * The cookie notice. Since Google Analytics was removed (2026-11-19) the app stores only what it
 * needs to work, so this is a notice with one «Verstanden» button, not a consent choice.
 *
 * Whether it shows at all is the tenant's decision: `app-config.cookieBannerEnabled` (default
 * false), edited by the tenant admin in AOC «Datenschutz». The text is the tenant's
 * `cookieBannerText[lang]`, falling back to its German text and then to the shipped default.
 * When the admin changes the text, visitors who acknowledged the old one see the banner once more.
 *
 * The app root passes the three `app-config` values in (a ui lib may not reach `AppStore`); they
 * live on `app-config` because the banner shows before login, when that is the only tenant
 * document a visitor can read.
 */
@Component({
  selector: 'okr-cookie-banner',
  standalone: true,
  imports: [IonButton, RouterLink],
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
      /* above the iPhone home indicator (viewport-fit=cover, spec 1.10 Phase 3) */
      padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.18);
    }
    .banner-text {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-line;
    }
    .banner-text a {
      margin-left: 4px;
    }
    .banner-actions ion-button {
      min-width: 140px;
    }
  `],
  template: `
    @if (showBanner()) {
      <div class="cookie-banner" role="dialog" [attr.aria-label]="i18n.banner_aria()" aria-live="polite">
        <p class="banner-text">{{ text() }}
          @if (privacyHref(); as href) {
            <a [routerLink]="href">{{ i18n.banner_privacy() }}</a>
          }
        </p>
        <div class="banner-actions">
          <ion-button color="primary" (click)="acknowledge()">{{ i18n.banner_ok() }}</ion-button>
        </div>
      </div>
    }
  `,
})
export class CookieBanner {
  private readonly consentService = inject(ConsentService);
  private readonly transloco = inject(TranslocoService);

  protected readonly i18n = inject(I18nService).translateAll(CONSENT_I18N_KEYS) as ConsentI18n;

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  private readonly consent = toSignal(this.consentService.consent$, { initialValue: this.consentService.getState() });

  // inputs — `app-config.cookieBannerEnabled` / `cookieBannerText` / `privacyPolicyPageKey`
  public readonly enabled = input<boolean | undefined>(false);
  public readonly texts = input<Record<string, string> | undefined>({});
  public readonly privacyPageKey = input<string | undefined>('');

  protected readonly text = computed(() => {
    const texts = this.texts() ?? {};
    const own = (texts[this.lang()] ?? '').trim() || (texts['de'] ?? '').trim();
    return own || this.i18n.banner_text();
  });

  /**
   * Fingerprint of the tenant's wording in ALL languages, not of the text on screen: switching the
   * language, or the shipped default still loading, must not show the banner again — only an
   * edit by the tenant admin does.
   */
  private readonly textHash = computed(() => {
    const texts = this.texts() ?? {};
    const own = Object.keys(texts).sort().map(lang => `${lang}=${(texts[lang] ?? '').trim()}`).join('\n');
    return cookieNoticeHash(own);
  });

  protected readonly privacyHref = computed(() => {
    const key = this.privacyPageKey() ?? '';
    return key ? `/page/${key}` : '';
  });

  protected readonly showBanner = computed(() => {
    if (this.enabled() !== true || !this.text()) return false;
    const state = this.consent();
    return !state.decided || state.textHash !== this.textHash();
  });

  protected acknowledge(): void {
    this.consentService.acknowledge(this.textHash());
  }
}
