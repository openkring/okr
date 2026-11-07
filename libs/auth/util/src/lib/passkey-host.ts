/**
 * May this host offer passkeys? Only the tenant's `app-config.appDomain`, plus localhost for development:
 * the same rule as `resolveRpId` in the `passkey` callable, which refuses every other host.
 * Whether the device can create or use a passkey is a separate question.
 */
export function offersPasskeys(hostname: string, appDomain: string): boolean {
  return hostname === 'localhost' || (appDomain !== '' && hostname === appDomain);
}
