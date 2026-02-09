import { Clipboard } from '@capacitor/clipboard';
import { ToastController } from '@ionic/angular';
import { error, showToast } from './alert.util';

/**
 * Copies the specified content to the clipboard and displays a confirmation message to the user.
 * @param toastController The ToastController to use for displaying messages.
 * @param content The content to copy to the clipboard.
 * @param confirmMsg The message to display to the user on successful copy.
 */
export async function copyToClipboardWithConfirmation(toastController: ToastController, content: string | number, confirmMsg = '@general.operation.copy.conf') {
    copyToClipboard(content)
    .then(() => {
        showToast(toastController, confirmMsg);
    })
    .catch(ex => {
        error(toastController, `copy.util/copyToClibboard(${content}, confirmMsg) -> ERROR with navigator.clipboard: ${ex}`);
    });
}

/**
 * Copies the specified content to the clipboard.
 * @param content The content to copy to the clipboard, as a string or number.
 * @returns A promise that resolves when the content has been copied.
 */
export async function copyToClipboard(content: string | string[] | number | boolean | undefined): Promise<void> {
  let _content = '';
  if (typeof content === 'number') {
    _content = content + '';
  } else if (typeof content === 'boolean') {
    _content = content ? 'true' : 'false';
  } else if (Array.isArray(content)) {
    _content = content.toString()
  } else {
    _content = content ?? '';
  }  
  
  try {
    await Clipboard.write({ string: _content});
  } catch (err) {
    // Fallback for mobile web browsers that lose user gesture context
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(_content);
    } else if (typeof document !== 'undefined') {
      // Legacy fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = _content;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } else {
      throw err;
    }
  }
}

/**
 * Retrieves the current contents of the clipboard.
 * @returns A promise that resolves with the contents of the clipboard as a string.
 */
export async function pasteFromClipboard(): Promise<string> {
    const { value } = await Clipboard.read();
    return value;
}

/**
 * Executes a function several times.
 * source: https://stackoverflow.com/questions/30452263/is-there-a-mechanism-to-loop-x-times-in-es6-ecmascript-6-without-mutable-varia
 * use it like this:   times (3) (() => console.log('hi'))
 * The given value is not truncated, so be careful with fractions (e.g. 3.7 is executed 4 times).
 * @param x defines how many times the function f should be executed
 */
export const times = (x: number) => (f: () => void) => {
  if (Number.isNaN(x)) {
    console.warn('copy.util: number may not be NaN');
    return;
  }
  const inf = Infinity;
  if (x === inf) {
    console.warn('copy.util: number may not be Infinity');
    return;
  }

  if (x > 0) {
    f()
    times (x - 1) (f)
  }
}