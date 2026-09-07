import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow, IonText } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { getImgixUrlWithAutoParams } from '@okr/shared-util-core';
import { AuthCredentials } from '@okr/shared-models';

import { LoginForm } from '@okr/auth-ui';
import { isRetryablePwdResetFailure, PwdResetFailure } from '@okr/auth-util';

import { AuthStore } from './auth.store';

@Component({
  selector: 'okr-confirm-password-reset-page',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm,
    IonContent, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonButton, IonText,
  ],
  styles: `
    .background-image { filter: blur(8px); -webkit-filter: blur(8px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7; z-index: 1; }
    .title { text-align: center; font-size: 2rem; padding: 20px; }
    .logo { max-width: 150px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; padding: 20px; }
    .button-container { margin: 20px; }
    @media (width <= 600px) {
      .login-form { width: 100%; text-align: center; z-index: 5; }
      .login-container { display: flex; height: 100%; padding: 10px; }
    }
    @media (width > 600px) {
      .login-form { border-radius: 10px; max-width: 600px; width: 90%; text-align: center; z-index: 5; }
      .login-container { display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; margin: 20px; }
    }
  `,
  template: `
    <okr-header [i18n]="{ title: store.i18n.pwdconfirm() }" [showCloseButton]="false" />
    <ion-content>
      <div class="login-container">
        <img class="background-image" [src]="backgroundImageUrl()" [alt]="store.i18n.background_alt()" />
        <div class="login-form">
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="store.gotoHome()" />
          <ion-label class="title"><strong>{{ store.i18n.newpwd() }}</strong></ion-label>

          @if (deadLink()) {
            <ion-text color="danger">
              <p>{{ errorMessage() }}</p>
            </ion-text>
            <div class="button-container">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-button expand="block" (click)="store.gotoNewResetLink()">
                      {{ store.i18n.request_new_link() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col>
                    <ion-button expand="block" fill="outline" (click)="store.gotoLogin()">
                      {{ store.i18n.goto_login() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </div>
          } @else if (success()) {
            <ion-text color="success">
              <p>{{ store.i18n.success() }}</p>
            </ion-text>
          } @else {
            @if (errorMessage()) {
              <ion-text color="danger">
                <p>{{ errorMessage() }}</p>
              </ion-text>
            }
            <okr-login-form context="password"
              [(vm)]="currentCredentials" (validChange)="onValidChange($event)"
              [i18n]="store.i18n"
            />
            <div class="button-container">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-button expand="block" [disabled]="!formIsValid()" (click)="confirm()">
                      {{ store.i18n.savepwd() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </div>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class ConfirmPasswordResetPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(AuthStore);

  // inputs
  private readonly oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
  private readonly continueUrl = this.route.snapshot.queryParamMap.get('continueUrl') ?? '/auth/login';

  // computed
  public logoUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().welcomeBannerUrl)}`);

  // signals
  protected formIsValid = signal(false);
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });
  protected success = signal(false);

  /** Why the last attempt failed — undefined while nothing has gone wrong yet. */
  protected failure = signal<PwdResetFailure | undefined>(this.oobCode ? undefined : 'unknown');

  /**
   * A dead link cannot be saved by retrying, so the form is replaced by the message plus the
   * two ways out (new link / sign in). weakPassword and network keep the form: the message
   * appears above it and the user simply tries again.
   */
  protected deadLink = computed(() => {
    const reason = this.failure();
    return reason !== undefined && !isRetryablePwdResetFailure(reason);
  });

  protected errorMessage = computed(() => {
    switch (this.failure()) {
      case 'expired':      return this.store.i18n.error_expired();
      case 'used':         return this.store.i18n.error_used();
      case 'noAccount':    return this.store.i18n.error_noAccount();
      case 'weakPassword': return this.store.i18n.error_weakPassword();
      case 'network':      return this.store.i18n.error_network();
      case 'unknown':      return this.store.i18n.invalid_link();
      default:             return '';
    }
  });

  // methods
  public async confirm(): Promise<void> {
    const reason = await this.store.confirmPasswordReset(this.oobCode, this.continueUrl, this.currentCredentials().loginPassword);
    this.failure.set(reason);
    if (!reason) this.success.set(true);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
