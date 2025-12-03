import { AlertController, AlertOptions, ToastController } from '@ionic/angular';

import { TOAST_LENGTH } from '@bk2/shared-constants';
import { bkTranslate } from '@bk2/shared-i18n';

/**
* In debug mode, write an error message to the console.
* Optionally (if toastController is set), show the error message as a toast for TOAST_LENGTH milliseconds.
* @param toastController the ionic ToastController
* @param message the message to log and show
* @param isDebugMode debug modus
*/
export function error(toastController: ToastController | undefined, message: string, isDebugMode = false): undefined {
  if (isDebugMode === true) {
      console.error(bkTranslate(message));
  }
  if (toastController) {
      showToast(toastController, message);
  }
  return undefined;
}

/**
 * Show a message in a toast at the bottom of the screen for 3 secs.
 * The message given can either be a i18n translation key (with a leading @) or the plain text.
 * By default, the message is also written into the log.
 * This can be turned off by setting parameter writeLog to false.
 * @param toastController the ionic ToastController
 * @param message the message to be shown or the i18n key to be translated.
 */
export async function showToast(toastController: ToastController, message: string): Promise<void> {
  const _toast = await toastController.create({
      message: bkTranslate(message),
      duration: TOAST_LENGTH
  });
  _toast.present();
}

/**
* Show a confirmation dialog with an OK and an optional cancel button.
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
  const alertConfig: AlertOptions = isCancellable === false ? {
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
    alertConfig['cssClass'] = cssClass;
  }
  const alert = await alertController.create(alertConfig);
  await alert.present();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { role } = await alert.onWillDismiss();
  return role === 'confirm';
}

export type PromptInputType = 'text' | 'number' | 'password';

/**
* Prompts for a text input.
* @param alertController the ionic alert controller
* @param message is a message to be shown in the alert or the i18n key to be translated (starting with @)
* @param cssClass optional styling attributes
*/
export async function bkPrompt(alertController: AlertController, header: string, placeholder: string): Promise<string | undefined> {
  const buttons = [{
      text: bkTranslate('@general.operation.change.cancel'),
      role: 'cancel'
    }, {
      text: bkTranslate('@general.operation.change.ok'),
      role: 'confirm'
    }];
    
  const alert = await alertController.create({
    header: bkTranslate(header),
    buttons: buttons,
    inputs: [{
      type: 'textarea',
      placeholder: bkTranslate(placeholder)
    }]
  });
  await alert.present();
  const { data, role } = await alert.onWillDismiss();
  if (data?.values?.length === 0) return undefined;
  if (role === 'confirm') {
    return data?.values[0] as string;
  } else {
    return undefined;
  }
}
