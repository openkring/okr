
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
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * 
 * @param size size of the random string to be generated
 * Generates a random string of the given size using Math.random().toString(36).
 * Math.random() generates a random number between 0 and 1, which is then converted to a base-36 string.
 * Base-36 uses digits 0-9 and letters a-z, so the resulting string will contain a mix of numbers and letters, e.g. 0.k8j5mn...
 * The string will be truncated to the specified size.
 * Example outputs:
 * - generateRandomString(8)   // "k8j5m2n1"
 * - generateRandomString(10)  // "3x7q9w1e8r"
 * - generateRandomString(6)   // "zx4v2b"
 * - generateRandomString(12)  // "a1s2d3f4"
 * @returns a random string of the specified size
 */
export function generateRandomString(size: number): string {
  if (size <= 0) return '';
  
  let result = '';
  while (result.length < size) {
    result += Math.random().toString(36).substring(2);
  }
  
  return result.substring(0, size);
}