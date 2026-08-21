import { Component, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, ModalController } from '@ionic/angular/standalone';

import { AuthCredentials } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';

import { AuthService } from '@okr/auth-data-access';
import { LoginForm } from '@okr/auth-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { AuthStore } from './auth.store';

@Component({
  selector: 'okr-login-modal',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm,
    IonContent, IonButton, IonItem
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" [isModal]="true" />
    <ion-content>
      <okr-login-form context="login"
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
    await dismissOverlay(this.modalController, this.currentCredentials, 'cancel');
    this.authService.login(this.currentCredentials(), this.store.config().rootUrl, this.store.config().loginUrl);
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
