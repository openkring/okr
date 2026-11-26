/**
 * Capacitor's `App.getLaunchUrl()` returns the URL that started the native app for the whole life of
 * the app process — also after the web view reloads. The Kring portal reloads to switch tenant
 * (spec 1.179), so following the launch URL on every start re-opened a tenant link `/t/<id>` after
 * each reload: an endless switch loop. `takeLaunchUrl` hands a launch URL out once per web-view
 * session (sessionStorage survives a reload, not a new app process).
 */
export const LAUNCH_URL_HANDLED_KEY = 'okr.launchUrlHandled';

export function takeLaunchUrl(
  url: string | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
): string | undefined {
  if (!url) return undefined;
  try {
    if (storage?.getItem(LAUNCH_URL_HANDLED_KEY) === url) return undefined;
    storage?.setItem(LAUNCH_URL_HANDLED_KEY, url);
  } catch {
    // blocked storage: follow the link; without a reload in between there is no loop
  }
  return url;
}
