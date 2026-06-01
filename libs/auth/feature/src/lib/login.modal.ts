import { Component, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, ModalController } from '@ionic/angular/standalone';

import { AuthCredentials } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';

import { AuthService } from '@bk2/auth-data-access';
import { LoginForm } from '@bk2/auth-ui';

import { AuthStore } from './auth.store';

@Component({
  selector: 'bk-login-modal',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm,
    IonContent, IonButton, IonItem
  ],
  template: `
    <bk-header [i18n]="{ title: store.i18n.title() }" [isModal]="true" />
    <ion-content>
      <bk-login-form context="login"
        [(vm)]="currentCredentials" (validChange)="formIsValid = $event"
        [i18n]="store.i18n"
      />
      <ion-item lines="none">
        <ion-button slot="start" fill="clear" (click)="cancel()">{{ store.i18n.cancel() }}</ion-button>
        <ion-button slot="end" fill="clear" [disabled]="!formIsValid" (click)="login()">{{ store.i18n.title() }}</ion-button>
      </ion-item>
    </ion-content>
  `,
})
export class LoginModal {
  private readonly modalController = inject(ModalController);
  protected readonly authService = inject(AuthService);
  protected readonly store = inject(AuthStore);

  protected formIsValid = false;
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });

  public async login(): Promise<void> {
    await this.modalController.dismiss(this.currentCredentials, 'cancel');
    this.authService.login(this.currentCredentials(), this.store.config().rootUrl, this.store.config().loginUrl);
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(undefined, 'cancel');
  }
}
