import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AlertController, AlertOptions, ToastController } from '@ionic/angular';
import { TOAST_LENGTH } from '@okr/shared-constants';

let _translocoService: TranslocoService | null = null;

export function initAlertTranslation(service: TranslocoService): void {
  _translocoService = service;
}

async function t(key: string | null | undefined): Promise<string> {
  if (!key) return '';
  if (!key.startsWith('@')) return key;
  if (!_translocoService) return key;
  const translationKey = key.substring(1);
  const dotIndex = translationKey.indexOf('.');
  const prefix = dotIndex === -1 ? '' : translationKey.substring(0, dotIndex);
  // scoped key (`@domain/layer.key`): its bundle is lazy-loaded, so load it before translating
  if (prefix.includes('/')) {
    const lang = _translocoService.getActiveLang();
    await firstValueFrom(_translocoService.load(`${prefix}/${lang}`));
    return _translocoService.translate(translationKey.substring(dotIndex + 1), {}, prefix);
  }
  return _translocoService.translate(translationKey);
}

export function error(toastController: ToastController | undefined, message: string, isDebugMode = false): undefined {
  if (isDebugMode === true) {
    console.error(message);
  }
  if (toastController) {
    showToast(toastController, message);
  }
  return undefined;
}

export async function showToast(toastController: ToastController, message: string): Promise<void> {
  const _toast = await toastController.create({
    message: await t(message),
    duration: TOAST_LENGTH
  });
  _toast.present();
}

export async function confirm(
  alertController: AlertController,
  message: string,
  okLabel: string,
  cancelLabel: string,
  isCancellable = false,
  cssClass?: string
): Promise<boolean> {
  const alertConfig: AlertOptions = isCancellable === false ? {
    message,
    buttons: [okLabel]
  } : {
    message,
    buttons: [
      { text: cancelLabel, role: 'cancel' },
      { text: okLabel, role: 'confirm' }
    ]
  };
  if (cssClass) {
    alertConfig['cssClass'] = cssClass;
  }
  const alert = await alertController.create(alertConfig);
  await alert.present();
  const { role } = await alert.onWillDismiss();
  return role === 'confirm';
}

/**
 * A one-button alert that only informs — no choice to make, nothing to cancel. Use it where an
 * action is refused and the user deserves the reason (e.g. answering a locked invitation), rather
 * than a toast that scrolls away or a silent no-op.
 */
export async function notify(
  alertController: AlertController,
  header: string,
  message: string,
  okLabel: string
): Promise<void> {
  const alert = await alertController.create({ header, message, buttons: [okLabel] });
  await alert.present();
  await alert.onWillDismiss();
}

export type PromptInputType = 'text' | 'number' | 'password';

export async function okrPrompt(
  alertController: AlertController,
  header: string,
  placeholder: string,
  okLabel: string,
  cancelLabel: string,
  value?: string
): Promise<string | undefined> {
  const alert = await alertController.create({
    header,
    cssClass: 'okr-prompt-alert',
    buttons: [
      { text: cancelLabel, role: 'cancel' },
      { text: okLabel, role: 'confirm' }
    ],
    inputs: [{ type: 'textarea', placeholder, value }]
  });
  await alert.present();
  const { data, role } = await alert.onWillDismiss();
  if (data?.values?.length === 0) return undefined;
  if (role === 'confirm') return data?.values[0] as string;
  return undefined;
}
