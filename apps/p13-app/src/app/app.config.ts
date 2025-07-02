import { BrowserModule } from '@angular/platform-browser';
import { ApplicationConfig, importProvidersFrom, isDevMode, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withComponentInputBinding, withEnabledBlockingInitialNavigation, withPreloading } from '@angular/router';
import { appRoutes } from './app.routes';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

// plain firebase with rxfire
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

import { ENV } from '@bk2/shared/config';
import { environment } from '../environments/environment';

// i18n with transloco
import { provideTransloco } from '@jsverse/transloco';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService, TranslocoHttpLoader } from '@bk2/shared/i18n';
import { getCategoryAbbreviation, Languages } from '@bk2/shared/categories';
import { AvailableLanguages, DefaultLanguage } from '@bk2/shared/models';

const app = initializeApp(environment.firebase);

if (environment.production === false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (<any>window).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
// Create a ReCaptchaEnterpriseProvider instance using the reCAPTCHA Enterprise
// site key and pass it to initializeAppCheck().
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(
    environment.services.appcheckRecaptchaEnterpriseKey
  ),
  isTokenAutoRefreshEnabled: true, // Set to true to allow auto-refresh.
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    { provide: ENV, useValue: environment },
    provideAnimations(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ useSetInputAPI: true }),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
      withEnabledBlockingInitialNavigation()
    ),

    importProvidersFrom(TranslateModule.forRoot()),

    // Browser and HttpClient
    importProvidersFrom(BrowserModule),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: AvailableLanguages,
        defaultLang: getCategoryAbbreviation(Languages, DefaultLanguage),
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    I18nService
  ],
};
