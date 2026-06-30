import { Injectable, Signal, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HashMap, TranslocoService, getBrowserLang } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
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
      // Strip the scope prefix from the key — Transloco resolves scoped keys as
      // selectTranslate(keyWithinScope, params, scope), loading scope/<lang>.json.
      const scopeKey = translationKey.substring(prefix.length + 1);
      return this.translocoService.load(`${prefix}/${lang}`).pipe(
        switchMap(() => argument
          ? this.translocoService.selectTranslate(scopeKey, argument, prefix)
          : this.translocoService.selectTranslate(scopeKey, {}, prefix)),
        // A scope's de.json fetch can fail transiently — most often because Safari aborts the
        // in-flight request on reload/navigation. Without this, Transloco throws "Unable to load
        // translation and all the fallback languages…" as an uncaught error that pollutes Sentry.
        // Degrade gracefully to an empty string instead (the load usually succeeds on the real,
        // non-aborted attempt); keep dev visibility via a warning.
        catchError((err) => {
          if (isDevMode()) console.warn(`I18nService.translate: failed to load i18n scope '${prefix}'`, err);
          return of('');
        })
      );
    }

    return argument
      ? this.translocoService.selectTranslate(translationKey, argument)
      : this.translocoService.selectTranslate(translationKey);
  }

  /**
   * The method maps each key in the given keys array to a value pair <key, translated value>.
   * It returns all value pairs as signals in an array.
   * toSignal requires an injection context, so this must be called from a class field initializer
   * or constructor.
   * example: 
   * protected readonly i18n = this.i18nService.translateAll({
       title:            PFX + 'chat.title',
       rooms:            PFX + 'chat.rooms',
       norooms:          PFX + 'chat.norooms',
       cancel:  '@cancel'
      });
    the translated values can then be used with e.g. i18n.title()
   * @param keys 
   * @returns 
   */
  public translateAll<K extends string>(keys: Record<K, string>, params?: HashMap): Record<K, Signal<string>> {
    return Object.fromEntries(
      Object.entries(keys).map(([k, v]) => [k, toSignal(this.translate(v as string, params), { initialValue: '' })])
    ) as Record<K, Signal<string>>;
  }
}
