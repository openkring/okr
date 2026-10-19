import { inject, Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { TranslocoService } from '@jsverse/transloco';
import { I18nService } from '@okr/shared-i18n';
import { okrPrompt, confirm, error, initAlertTranslation, notify, showToast } from './alert.util';

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

  public async okrPrompt(header: string, placeholder: string, value?: string): Promise<string | undefined> {
    return okrPrompt(this.alertController, header, placeholder, this.i18n.ok(), this.i18n.cancel(), value);
  }

  /** A one-button alert that only informs (header + HTML message + OK). */
  public async notify(header: string, message: string): Promise<void> {
    return notify(this.alertController, header, message, this.i18n.ok());
  }

  public async showToast(message: string): Promise<void> {
    return showToast(this.toastController, message);
  }

  public error(message: string, isDebugMode = false): undefined {
    return error(this.toastController, message, isDebugMode);
  }
}
