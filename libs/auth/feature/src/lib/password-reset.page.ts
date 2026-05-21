import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { Header } from '@bk2/shared-ui';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getImgixUrlWithAutoParams } from '@bk2/shared-util-core';
import { AuthCredentials } from '@bk2/shared-models';

import { AuthService } from '@bk2/auth-data-access';
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
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="gotoHome()"></ion-img>
          <ion-label class="title"><strong>{{ store.i18n.pwdreset_title() }}</strong></ion-label>
          <bk-login-form context="email"
            [(vm)]="currentCredentials" (validChange)="onValidChange($event)"
            [i18n]="store.i18n"
            [emailHelper]="emailHelper()"
            [pwdHelper]="pwdHelper()"
          />
          <div class="button-container">
            <ion-grid>
              <ion-row>
                <ion-col size="4">
                  <ion-button expand="block" fill="outline" (click)="gotoHome()">{{ store.i18n.cancel() }}</ion-button>
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly appStore = inject(AppStore);
  protected readonly store = inject(AuthStore);

  public logoUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().welcomeBannerUrl)}`);
  protected emailHelper = computed(() => '');
  protected pwdHelper = computed(() => '');
  //protected emailHelper = computed(() => this.context() === 'email' ? '@input.emailEmail.helper' : '@input.loginEmail.helper');
  //protected pwdHelper = computed(() => this.context() === 'password' ? '@input.passwordPassword.helper' : '@input.loginPassword.helper');

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
    const email = this.currentCredentials().loginEmail;
    if (email) {
      await this.authService.resetPassword(email, this.appStore.appConfig().loginUrl);
    }
  }

  /**
   * Change to the Home page.
   */
  public async gotoHome(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().rootUrl);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
