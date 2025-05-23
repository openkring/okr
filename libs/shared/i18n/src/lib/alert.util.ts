import { ToastController, AlertController, AlertOptions } from '@ionic/angular';
import { warn } from '@bk2/shared/util';
import { bkTranslate } from './i18n.util';

/**
* In debug mode, write an error message to the console.
* Optionally, show the error message as a toast for toastLength milliseconds.
* @param toastController the ionic ToastController
* @param message the message to log and show
* @param isDebugMode debug modus
*/
export function error(toastController: ToastController | undefined, message: string, isDebugMode = false, toastLength = 3000): void {
    if (isDebugMode === true) {
        console.error(bkTranslate(message));
    }
    if (toastController) {
        showToast(toastController, message, toastLength);
    }
}

/**
 * Show a message in a toast at the bottom of the screen for 3 secs.
 * The message given can either be a i18n translation key (with a leading @) or the plain text.
 * By default, the message is also written into the log.
 * This can be turned off by setting parameter writeLog to false.
 * @param toastController the ionic ToastController
 * @param message the message to be shown or the i18n key to be translated.
 * @param toastLength the display duration of the toast in milliseconds
 */
export async function showToast(toastController: ToastController, message: string, toastLength: number): Promise<void> {
    const _toast = await toastController.create({
        message: bkTranslate(message),
        duration: toastLength
    });
    _toast.present();
}

/**
* Show a confirmation dialog with just an OK button.
* @param alertController the ionic alert controller
* @param message is a message to be shown in the alert or the i18n key to be translated (starting with @)
* @param isCancellable if true the alert shows a cancel button additionally to the ok button
* @param cssClass optional styling attributes
*/
export async function confirm(
    alertController: AlertController,
    message: string,
    isCancellable = false,
    cssClass?: string
): Promise<boolean> {
    const _alertConfig: AlertOptions = isCancellable === false ? {
        message: bkTranslate(message),
        buttons: [bkTranslate('@general.operation.change.ok')]
    } : {
        message: bkTranslate(message),
        buttons: [{
            text: bkTranslate('@general.operation.change.cancel'),
            role: 'cancel'
        }, {
            text: bkTranslate('@general.operation.change.ok'),
            role: 'confirm'
        }]
    };
    if (cssClass) {
        // tslint:disable-next-line: no-string-literal
        _alertConfig['cssClass'] = cssClass;
    }
    const _alert = await alertController.create(_alertConfig);
    await _alert.present();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data, role } = await _alert.onWillDismiss();
    return role === 'confirm';
  }

export async function confirmAction(message: string, writeWarning = true, toastController?: ToastController, toastLength?: number): Promise<void> {
    if (toastController !== undefined && toastLength !== undefined) {
        await showToast(toastController, message, toastLength);
    }
    if (writeWarning === true) warn(bkTranslate(message));
}

export type PromptInputType = 'text' | 'number' | 'password';

/**
* Prompts for a text input.
* @param alertController the ionic alert controller
* @param message is a message to be shown in the alert or the i18n key to be translated (starting with @)
* @param cssClass optional styling attributes
*/
export async function bkPrompt(alertController: AlertController, header: string, placeholder: string): Promise<string | undefined> {
  const _buttons = [{
      text: bkTranslate('@general.operation.change.cancel'),
      role: 'cancel'
    }, {
      text: bkTranslate('@general.operation.change.ok'),
      role: 'confirm'
    }];
  const _inputs = [{
    placeholder: bkTranslate(placeholder)
  }];
    
  const _alert = await alertController.create({
    header: bkTranslate(header),
    buttons: _buttons,
    inputs: _inputs
  });
  await _alert.present();
  const { data, role } = await _alert.onWillDismiss();
  if (role === 'confirm') {
    return data.values[0] as string;
  } else {
    return undefined;
  }
}
