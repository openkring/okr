import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';
import { getImgixUrlWithAutoParams } from '@bk2/shared-util-core';
import { AuthCredentials } from '@bk2/shared-models';

import { LoginForm } from '@bk2/auth-ui';

import { AuthStore } from './auth.store';

@Component({
  selector: 'bk-password-reset-page',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm,
    IonContent, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonButton
  ],
  styles: `
      .background-image { filter: blur(8px); -webkit-filter: blur(8px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7; z-index: 1;}
      .title { text-align: center; font-size: 2rem; padding: 20px; }
      .logo { max-width: 150px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; padding: 20px; }
      .button-container { margin: 20px; }
      @media (width <= 600px) {
        .login-form { width: 100%; text-align: center; z-index: 5; }
        .login-container {  display: flex; height: 100%; padding: 10px; }
      }
      @media (width > 600px) {
        .login-form { border-radius: 10px; max-width: 600px; width: 90%; text-align: center; z-index: 5; }
        .login-container {  display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; margin: 20px; }
      }
    `,
  template: `
    <bk-header [i18n]="{ title: store.i18n.pwdreset_title() }" [showCloseButton]="false" />
    <ion-content>
      <div class="login-container">
        <img class="background-image" [src]="backgroundImageUrl()" alt="Ruderer des Seeclub Stäfa" />
        <div class="login-form">
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="store.gotoHome()"></ion-img>
          <ion-label class="title"><strong>{{ store.i18n.pwdreset_title() }}</strong></ion-label>
          <bk-login-form context="email"
            [(vm)]="currentCredentials" (validChange)="onValidChange($event)"
            [i18n]="store.i18n"
          />
          <div class="button-container">
            <ion-grid>
              <ion-row>
                <ion-col size="4">
                  <ion-button expand="block" fill="outline" (click)="store.gotoHome()">{{ store.i18n.cancel() }}</ion-button>
                </ion-col>
                <ion-col size="2" offset="6">
                  <ion-button expand="block" [disabled]="!formIsValid()" (click)="resetPassword()">{{ store.i18n.ok() }}</ion-button>
                </ion-col>
              </ion-row>
            </ion-grid>
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class PasswordResetPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(AuthStore);

  public logoUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().welcomeBannerUrl)}`);

  protected formIsValid = signal(false);
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: this.route.snapshot.queryParamMap.get('email') ?? '',
    loginPassword: '',
  });

  /**
   * If the form is valid it will call the AuthData service to reset the user's password displaying a loading
   * component while the user waits.
   */
  public async resetPassword(): Promise<void> {
    await this.store.resetPassword(this.currentCredentials().loginEmail);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
