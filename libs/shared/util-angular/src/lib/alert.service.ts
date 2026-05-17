import { inject, Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { I18nService } from '@bk2/shared-i18n';
import { bkPrompt, confirm, error, initAlertTranslation, showToast } from './alert.util';

@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly i18n = inject(I18nService).translateAll({
    ok:     '@ok',
    cancel: '@cancel',
  });

  constructor() {
    initAlertTranslation(inject(TranslocoService));
  }

  public async confirm(message: string, isCancellable = false, cssClass?: string): Promise<boolean> {
    return confirm(this.alertController, message, this.i18n.ok(), this.i18n.cancel(), isCancellable, cssClass);
  }

  public async bkPrompt(header: string, placeholder: string, value?: string): Promise<string | undefined> {
    return bkPrompt(this.alertController, header, placeholder, this.i18n.ok(), this.i18n.cancel(), value);
  }

  public async showToast(message: string): Promise<void> {
    return showToast(this.toastController, message);
  }

  public error(message: string, isDebugMode = false): undefined {
    return error(this.toastController, message, isDebugMode);
  }
}
