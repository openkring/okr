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
    try {
      if (!queryParams) {
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