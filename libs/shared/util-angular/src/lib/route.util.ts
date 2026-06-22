import { Params, Router } from '@angular/router';
import { die } from '@bk2/shared-util-core';
import { Subscription } from 'rxjs';

/************************************** routing helpers ********************************** */
/**
 * Convenience function to navigate to a url.
 * if queryParams is null, the url is called with navigateByUrl
 * if queryParams is a string, it is taken as backUrl.
 * else queryParams is used as a queryParams object
 * @param url the url to navigate to
 * @param queryParams the query parameters to pass
 */
export async function navigateByUrl(router: Router, url: string | undefined, queryParams?: Params): Promise<void> {
    if (!url || url.length === 0) die('route.util.navigateByUrl() -> ERROR: url is mandatory');
    if (!router) die('route.util.navigateByUrl() -> ERROR: router is mandatory');
    // Angular's Router only understands in-app (relative) URLs. An absolute URL — e.g. a Firebase
    // continueUrl like https://seeclub.org/auth/login — would be mis-parsed into a bogus route such
    // as /https:. Normalize it: keep same-origin links inside the SPA, hand genuine externals to the browser.
    if (/^https?:\/\//i.test(url)) {
      const parsed = new URL(url);
      const origin = globalThis.location?.origin;
      if (!origin || parsed.origin === origin) {
        url = parsed.pathname + parsed.search + parsed.hash;
      } else {
        globalThis.location.assign(url);
        return;
      }
    }
    // Skip navigation if already on the same URL (Ionic outlets throw on re-activation)
    const currentUrl = router.url.split('?')[0];
    if (currentUrl === url) return;
    const hasParams = queryParams != null && !Array.isArray(queryParams) && Object.keys(queryParams).length > 0;
    try {
      if (!hasParams) {
        await router.navigateByUrl(url);
      } else {
        await router.navigate([url], { queryParams });
      }
    }
    catch (ex: unknown) {
        console.error(`route.util.navigateByUrl(${url}, ${JSON.stringify(queryParams)}) -> FAILED`, ex);
    }
}

export function getSafeString(value: string | null | undefined, defaultValue: string): string {
    return value ?? defaultValue;
}

export function getSafeNumber(value: number | string | null, defaultValue: number): number {
    value ??= defaultValue;
    return (typeof value === 'string') ? Number(value) : value; 
}

export function getDefaultValue(parameterName: string, defaultValue?: string, isOptional = false): string {
    if (defaultValue) return defaultValue;
    if (isOptional) return '';
    die(`route.util.getDefaultValue() -> ERROR: parameter ${parameterName} is mandatory`);
}

/**
 * Unsubcribes safely from a Subscription. This is often used when parsing parameters from the route. That's why it is here.
 * @param subscription 
 */
export function closeSubscription(subscription: Subscription | undefined | null): void {
    if (subscription) {
      subscription.unsubscribe();
    }
}