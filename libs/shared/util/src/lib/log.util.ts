
/**
 * This function will never return; use it only for critical system errors (very exotic and rare cases).
 * Use like this:
 *      const appElement = document.getElementById('app') ?? die('Error: app element not found');
 * typescript does typeset reduction with this (eliminate e.g. null)
 * use it instead of if (attribute) {attribute.doSomething() }
 * @param message the message to print into the log
 */
export function die(message: string): never {
  throw new Error(message);
}

export function warn(message: string): void {
  console.warn(message);
}

/************************************** miscellaneous utility methods           ********************************** */
/**
 * Sleeps for ms milliseconds. Example usage: waiting for async operation to terminate.
 * @param ms milliseconds
 */
export async function sleep(ms: number): Promise<unknown> {
  return new Promise(_resolve => {
    setTimeout(_resolve, ms);
  });
}

export function generateRandomString(size: number): string {
  return Math.random().toString(36).substring(2, size);
}

/**
 *   --bk-test-color: #ccffff;
 *   --bk-archived-color: #ffcc99;
 * @param model the model defined the color
 */
export function getListItemColor(isArchived: boolean): string {
  if (isArchived) return getArchivedItemColor();
  return '';
}

function getArchivedItemColor(): string {
  return 'light';
}
