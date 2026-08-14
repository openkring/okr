import { HttpClient } from '@angular/common/http';
import { EnvironmentProviders, importProvidersFrom, inject, Injectable, isDevMode, makeEnvironmentProviders } from '@angular/core';
import { Translation, TranslocoConfig, translocoConfig, TranslocoLoader, TranslocoModule, TRANSLOCO_CONFIG, TRANSLOCO_LOADER } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
  }
}

export const provideTransloco = (
  config: Partial<TranslocoConfig>
): EnvironmentProviders => {
  return makeEnvironmentProviders([
    importProvidersFrom(TranslocoModule),
    {
      provide: TRANSLOCO_CONFIG,
      useValue: translocoConfig({
        availableLangs: config.availableLangs,
        defaultLang: config.defaultLang,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        // An empty value is a deliberate "no helper/placeholder here", not a missing key —
        // without this, Transloco routes ~40 intentionally-blank bundle entries through
        // SentryMissingHandler and each one opens its own i18n missing-key ticket.
        missingHandler: { allowEmpty: true },
      }),
    },
    { provide: TRANSLOCO_LOADER, useClass: TranslocoHttpLoader },
  ]);
};
