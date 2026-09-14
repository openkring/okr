import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { AuthCredentials } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { navigateByUrl } from '@okr/shared-util-angular';
import { getImgixUrlWithAutoParams, getSafeReturnUrl } from '@okr/shared-util-core';

import { AuthService } from '@okr/auth-data-access';
import { LoginForm, PwdResetSent } from '@okr/auth-ui';
import { emailValidations } from '@okr/auth-util';

import { AuthStore } from './auth.store';

@Component({
  selector: 'okr-login-page',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm, PwdResetSent,
    IonContent, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonButton, IonSpinner
  ],
  styles: `
  .background-image { filter: blur(8px); -webkit-filter: blur(8px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7; z-index: 1;}
  .title { text-align: center; font-size: 2rem; padding: 20px; }
  .logo { max-width: 150px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; padding: 20px; }
  .button-container { margin: 20px; }
  /*
    The screens sit on a blurred, 70%-opaque photo. Without a ground of their own the labels,
    helper texts and the clear/outline buttons were drawn straight onto that photo and their
    contrast depended on whichever part of the tenant's banner happened to be underneath.
    A translucent panel keeps the photo visible but gives every text a defined background.
    --ion-background-color-rgb follows the light/dark theme; the shadow separates the panel
    from the image at the edges.
  */
  .login-form {
    background: rgba(var(--ion-background-color-rgb, 255, 255, 255), 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: var(--ion-text-color);
    border-radius: 16px;
    padding: 4px 12px 12px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 30%);
  }
  .reset-button { --color: var(--ion-color-primary); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .reset-button ion-spinner { margin-inline-end: 8px; }
  @media (width <= 600px) {
     .login-form { width: 100%; text-align: center; z-index: 5; }
     .login-container {  display: flex; height: 100%; padding: 10px; }
   }
   @media (width > 600px) {
     .login-form { max-width: 600px; width: 90%; text-align: center; z-index: 5; }
     .login-container {  display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; margin: 20px; }
   }
  `,
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" [showCloseButton]="false" />
    <ion-content>
      <div class="login-container">
        <img class="background-image" [src]="backgroundImageUrl()" [alt]="store.i18n.background_alt()" />
        <div class="login-form">
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="gotoHome()" />
          @if (linkSent()) {
            <!--
              The mail state replaces the form in place. It used to be a toast on top of this same
              form: by the time the user looked up from their inbox the only thing on screen was
              the login form again, saying nothing about the link that was on its way.
            -->
            <okr-pwdreset-sent
              [i18n]="store.i18n"
              [email]="currentCredentials().loginEmail ?? ''"
              [resent]="linkResent()"
              [sending]="isSending()"
              (resend)="sendPasswordLink(true)"
              (useOther)="backToForm()"
            />
          } @else {
            <ion-label class="title"><strong>{{ store.i18n.title() }}</strong></ion-label>
            <okr-login-form context="login"
              [(vm)]="currentCredentials" (validChange)="onValidChange($event)"
              [i18n]="store.i18n"
            />
            <div class="button-container">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-button #loginButton [disabled]="!formIsValid()" (click)="login()">{{ store.i18n.title() }}</ion-button>
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col>
                    <!--
                      Needs the address, nothing else: enabled as soon as the email field is valid.

                      Sending runs through a Cloud Function and regularly takes a few seconds. The
                      button used to be merely disabled for that time, which on a phone is next to
                      invisible: the screen looked exactly as before the tap, so people tapped
                      again. Spinner plus a label that names what is happening.
                    -->
                    <ion-button class="reset-button" fill="clear" color="primary"
                      [disabled]="!emailIsValid() || isSending()"
                      (click)="sendPasswordLink(false)">
                      @if (isSending()) {
                        <ion-spinner name="dots" slot="start" aria-hidden="true" />
                        {{ store.i18n.pwdreset_sending() }}
                      } @else {
                        {{ store.i18n.pwdreset_cta() }}
                      }
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
export class LoginPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly authService = inject(AuthService);
  protected readonly store = inject(AuthStore);

  // computed
  public logoUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().welcomeBannerUrl)}`);

  // signals
  protected formIsValid = signal(false);
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });
  /** Whether the page currently shows the "check your mailbox" state instead of the form. */
  protected linkSent = signal(false);
  protected linkResent = signal(false);
  protected isSending = signal(false);

  /**
   * Only the address matters for sending a link, so this is computed separately from
   * formIsValid (which also wants a password). Without it the call to action would stay
   * disabled for exactly the users who need it — the ones with no password to type.
   */
  protected emailIsValid = computed(() => emailValidations(this.currentCredentials()).isValid());

  // methods
  /**
   * Send the link and stay on this page. `resent` only changes the wording of the confirmation,
   * so a second tap gives visible feedback instead of looking like nothing happened.
   */
  protected async sendPasswordLink(resent: boolean): Promise<void> {
    if (!this.emailIsValid() || this.isSending()) return;
    this.isSending.set(true);
    const ok = await this.store.resetPassword(this.currentCredentials().loginEmail);
    this.isSending.set(false);
    if (!ok) return;   // the service already reported the failure; keep the form so it can be retried
    this.linkResent.set(resent);
    this.linkSent.set(true);
  }

  /** Back to the form with the address still in the field, so a typo is a correction, not a retype. */
  protected backToForm(): void {
    this.linkSent.set(false);
    this.linkResent.set(false);
  }

  /**
   * Login a returning user with already existing credentials.
   */
  public async login(): Promise<void> {
    const returnUrl = getSafeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
    // On success resume where the user was headed; on failure come back to a login
    // page that still remembers it, so a mistyped password does not cost the deep link.
    await this.authService.login(
      this.currentCredentials(),
      returnUrl ?? this.store.config().rootUrl,
      this.retryUrl(returnUrl),
    );
  }

  /** The login URL to return to after a failed attempt, carrying the returnUrl along. */
  private retryUrl(returnUrl: string | null): string {
    const loginUrl = this.store.config().loginUrl;
    return returnUrl ? `${loginUrl}?returnUrl=${encodeURIComponent(returnUrl)}` : loginUrl;
  }

  public async gotoHome(): Promise<void> {
    await navigateByUrl(this.router, this.store.config().rootUrl);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
