import { Injectable } from '@angular/core';
import { HashMap, TranslocoService, getBrowserLang } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { selectLanguage } from './i18n.util';

import { AvailableLanguages } from '@bk2/shared-models';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  // classic DI so that mocks can be passed in tests
  constructor(private readonly translocoService: TranslocoService) {}

  public getBrowserLang(): string | undefined {
  return getBrowserLang();
  }

  public setActiveLang(language: string, defaultLanguage: string) {
  const selectedLanguage = selectLanguage(AvailableLanguages, defaultLanguage, language);
  this.translocoService.setActiveLang(selectedLanguage);
  }

  public getActiveLang(): string {
  return this.translocoService.getActiveLang();
  }

  // tbd: checkSupportedLang(lang: string): boolean

  /**
   * Translate a key into the current language.
   * We need to use selectTranslate() instead of translate() in order to make sure that the translations were loaded.
   * @param key the translation key, e.g. '@calevent.operation.create'
   * @param argument  an optional argument to pass to the translation function
   * @returns an observable of the translated string
   */
  public translate(key: string | null | undefined, argument?: HashMap): Observable<string> {
    if (!key || key.length === 0) return of('');
    if (!key.startsWith('@')) return of(key);

    const translationKey = key.substring(1);
    const dotIndex = translationKey.indexOf('.');
    const prefix = dotIndex === -1 ? translationKey : translationKey.substring(0, dotIndex);

    if (prefix.includes('/')) {
      const lang = this.translocoService.getActiveLang();
      return this.translocoService.load(`${prefix}/${lang}`).pipe(
        switchMap(() => argument
          ? this.translocoService.selectTranslate(translationKey, argument)
          : this.translocoService.selectTranslate(translationKey))
      );
    }

    return argument
      ? this.translocoService.selectTranslate(translationKey, argument)
      : this.translocoService.selectTranslate(translationKey);
  }
}
