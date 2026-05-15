import { TranslocoService } from '@jsverse/transloco';
import { AlertController, AlertOptions, ToastController } from '@ionic/angular';
import { TOAST_LENGTH } from '@bk2/shared-constants';

let _translocoService: TranslocoService | null = null;

export function initAlertTranslation(service: TranslocoService): void {
  _translocoService = service;
}

function t(key: string | null | undefined): string {
  if (!key) return '';
  if (!key.startsWith('@')) return key;
  if (!_translocoService) return key;
  return _translocoService.translate(key.substring(1));
}

export function error(toastController: ToastController | undefined, message: string, isDebugMode = false): undefined {
  if (isDebugMode === true) {
    console.error(t(message));
  }
  if (toastController) {
    showToast(toastController, message);
  }
  return undefined;
}

export async function showToast(toastController: ToastController, message: string): Promise<void> {
  const _toast = await toastController.create({
    message: t(message),
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

export type PromptInputType = 'text' | 'number' | 'password';

export async function bkPrompt(
  alertController: AlertController,
  header: string,
  placeholder: string,
  okLabel: string,
  cancelLabel: string,
  value?: string
): Promise<string | undefined> {
  const alert = await alertController.create({
    header,
    cssClass: 'bk-prompt-alert',
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
