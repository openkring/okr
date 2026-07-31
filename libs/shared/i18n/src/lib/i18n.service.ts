import { Injectable, Signal, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HashMap, TranslocoService, getBrowserLang } from '@jsverse/transloco';
import { Observable, firstValueFrom, of } from 'rxjs';
import { catchError, defaultIfEmpty, switchMap, take } from 'rxjs/operators';
import { selectLanguage } from './i18n.util';
import { reportI18nIssue } from './i18n-sentry';

import { AvailableLanguages, CategoryListModel, DefaultLanguageCode } from '@okr/shared-models';
import { getItemLabel } from '@okr/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  // classic DI so that mocks can be passed in tests
  constructor(private readonly translocoService: TranslocoService) {}

  public getBrowserLang(): string | undefined {
  return getBrowserLang();
  }

  // language is optional: omit it (or pass undefined) to seed from the browser language.
  // availableLanguages defaults to the full supported set; pass a tenant's enabled subset to
  // restrict seeding. selectLanguage falls back browser → defaultLanguage when unsupported.
  public setActiveLang(language?: string, defaultLanguage = DefaultLanguageCode, availableLanguages: string[] = AvailableLanguages) {
  const selectedLanguage = selectLanguage(availableLanguages, defaultLanguage, language);
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
          // Report to Sentry (deduped per key). A genuinely broken scope (typo, missing
          // de.json, forgotten sync-i18n-assets) surfaces as one persistent issue; the
          // occasional benign navigation-abort at most one deduped event per scope.
          reportI18nIssue(key, 'scope-load-failed');
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

  /**
   * Resolve a single key once, as a promise.
   *
   * `translate()`/`translateAll()` are the right tools for the template — they keep emitting
   * on language changes. One-shot consumers (CSV exports, reports, generated file names) run
   * inside an async method and need the value, not a stream. Never throws: an unresolvable
   * key degrades to an empty string.
   * @param key the translation key, e.g. '@resource/feature.rboat_type.b2x.label'
   * @param argument optional interpolation parameters
   */
  public translateOnce(key: string | null | undefined, argument?: HashMap): Promise<string> {
    return firstValueFrom(this.translate(key, argument).pipe(take(1), defaultIfEmpty('')));
  }

  /**
   * Resolve every item label of a category once and return a synchronous lookup.
   *
   * Category item labels are stored as i18n *keys* (see `getItemLabel`), so a cell in an
   * export cannot be rendered synchronously. Resolving the whole (small) category up front
   * turns the export's inner loop back into plain synchronous code.
   *
   * The returned resolver falls back to the raw item name for anything it does not know —
   * an unmapped code is more useful in a spreadsheet than an empty cell.
   * @param category the category list, e.g. appStore.getCategory('rboat_type')
   */
  public async createLabelResolver(category?: CategoryListModel): Promise<(itemName?: string) => string> {
    const labels = new Map<string, string>();
    if (category?.items) {
      await Promise.all(category.items.map(async (item) => {
        const label = await this.translateOnce(getItemLabel(category, item.name));
        if (isResolved(label, item.name)) labels.set(item.name, label);
      }));
    }
    return (itemName?: string) => (itemName ? labels.get(itemName) ?? itemName : '');
  }

  /**
   * Same as {@link createLabelResolver}, but for coded values that have i18n keys without a
   * backing category document (e.g. an ownership's `state`). Resolves `<prefix>.<value>.label`
   * for each distinct value once.
   * @param prefix the key prefix, e.g. '@relationship/ownership/feature.state'
   * @param values the distinct values to resolve
   */
  public async createValueResolver(prefix: string, values: Iterable<string>): Promise<(value?: string) => string> {
    const labels = new Map<string, string>();
    const distinct = [...new Set([...values].filter((value) => !!value))];
    await Promise.all(distinct.map(async (value) => {
      const label = await this.translateOnce(`${prefix}.${value}.label`);
      if (isResolved(label, value)) labels.set(value, label);
    }));
    return (value?: string) => (value ? labels.get(value) ?? value : '');
  }
}

/**
 * Whether a translation actually resolved. The missing-key handler returns the key itself
 * (scope-stripped) so the UI can show it — for an export that is worse than the raw code,
 * so a result that still looks like `<...>.<itemName>.label` counts as unresolved.
 */
function isResolved(label: string, itemName: string): boolean {
  return label.length > 0 && !label.endsWith(`${itemName}.label`);
}
