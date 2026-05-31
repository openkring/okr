import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { browserLocalPersistence, confirmPasswordReset, setPersistence, signInWithCustomToken, signInWithEmailAndPassword, signOut, verifyPasswordResetCode } from 'firebase/auth';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { AUTH, ENV } from '@bk2/shared-config';
import { AuthCredentials, UserModel } from '@bk2/shared-models';
import { AlertService, navigateByUrl } from '@bk2/shared-util-angular';
import { die, warn } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';
import { ActivityService } from '@bk2/activity-data-access';

import { PFX } from './scope';

/**
 * This provider centralizes the authentication functions
 * so that it is available several times by calling it from the provider.
 * This authentication implementation connects to a Firebase back-end with email/pwd authentication.
 * see: https://medium.com/javascript-in-plain-english/how-to-add-firebase
 * -authentication-to-pwa-or-angular-project-using-angularfire-83a8f61d367c
 * or Josh Morony: Creating Ionic Apps Angular Expert (chapter 4 CamperChat, p700)
 * 11.7.2023/bk rewriting to use signals
 * 12.8.2023/bk adding DataState and upgrading to AngularFire 7.6 with new API
 * 18.11.2023/bk rewriting to use rxfire
 * 21.11.2023/bk moved user related state into UserService and AuthorizationService
 * 30.8.2024/bk replaced ngxtension/connect with redux-like pattern (see https://www.youtube.com/watch?v=rHQa4SpekaA )
 * 26.1.2025/bk replaced with ngrx signal store
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = inject(AUTH);
  private readonly env = inject(ENV);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly activityService = inject(ActivityService);
  private readonly i18n = inject(I18nService).translateAll({
    login_conf:     PFX + 'login.conf',
    login_error:    PFX + 'login.error',
    pwdreset_conf:  PFX + 'pwdreset.conf',
    pwdreset_error: PFX + 'pwdreset.error',
    logout_conf:    PFX + 'logout.conf',
    logout_error:   PFX + 'logout.error',
    logout_confirm: PFX + 'logout.confirm',
  });

  /*-------------------------- login / logout / password reset --------------------------------*/
  /**
   * Login a returning user with already existing credentials.
   * @param credentials the login credentials of the user (email and password)
   * @param rootUrl the URL to navigate to after successful login
   * @param loginUrl the URL to navigate to in case of an error
   * @param passwort the user password
   */
  public async login(credentials: AuthCredentials, rootUrl: string, loginUrl: string): Promise<void> {
    try {
      if (!credentials.loginEmail || credentials.loginEmail.length === 0 || !credentials.loginPassword || credentials.loginPassword.length === 0) die('AuthService.login: email and password are mandatory.');
      /*  browserLocalPersistence indicates that the state will be persisted even when the browser window is closed. 
          An explicit sign out is needed to clear that state. 
          Note that Firebase Auth web sessions are single host origin and will be persisted for a single domain only.
          see: https://firebase.google.com/docs/auth/web/auth-state-persistence
          browserLocalPersistence, browserSessionPersistence, inMemoryPersistence
      */
      await setPersistence(this.auth, browserLocalPersistence);
      await signInWithEmailAndPassword(this.auth, credentials.loginEmail, credentials.loginPassword);
      void this.activityService.logAuth('login', `${credentials.loginEmail}: SUCCESS`);
      await this.alertService.showToast(this.i18n.login_conf());
      await navigateByUrl(this.router, rootUrl);
    } catch (ex) {
      void this.activityService.logAuth('login', `${credentials.loginEmail}: ERROR: ${ex}`);
      console.error('AuthService.login: error: ', ex);
      await this.alertService.showToast(this.i18n.login_error());
      await navigateByUrl(this.router, loginUrl);
    }
  }

  public async loginWithToken(token: string, url: string): Promise<void> {
    try {
      await signInWithCustomToken(this.auth, token);
      await this.alertService.showToast(this.i18n.login_conf());
      void this.activityService.logAuth('login', 'LoginWithToken: SUCCESS');
      await navigateByUrl(this.router, url);
    } catch (ex) {
      void this.activityService.logAuth('login', `LoginWithToken: ERROR: ${ex}`);
      console.error('AuthService.loginWithToken: error: ', ex);
      await this.alertService.showToast(this.i18n.login_error());
      await navigateByUrl(this.router, url);
    }
  }

  /**
   * Send a reset password link to an email address of a user who forgot her password.
   * @param loginEmail an email address of a user
   * @param loginUrl the URL to navigate to in case of an error
   */
  public async resetPassword(loginEmail: string, loginUrl: string): Promise<void> {
    try {
      if (!loginEmail || loginEmail.length === 0) die('AuthService.resetPassword: loginEmail is mandatory.');
      const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'sendEmail');
      await fn({ to: [loginEmail], appId: this.env.appId, provider: 'mailtrap_api', template: 'scs_password_reset' });
      void this.activityService.log('auth', 'pwdreset', undefined, `${loginEmail}: SUCCESS`);
      await this.alertService.showToast(this.i18n.pwdreset_conf() + loginEmail);
      await navigateByUrl(this.router, loginUrl);
    } catch (ex) {
      void this.activityService.log('auth', 'pwdreset', undefined, `${loginEmail}: ERROR: ${ex}`);
      console.error('AuthService.resetPassword: error: ', ex);
      await this.alertService.showToast(this.i18n.pwdreset_error());
      await navigateByUrl(this.router, loginUrl);
    }
  }

  /**
   * Verify a password reset code and confirm the new password.
   * Called from the custom confirm-password-reset page at /auth/confirm.
   * @param oobCode the out-of-band code from the reset link URL query params
   * @param newPassword the new password chosen by the user
   * @returns the email address on success, undefined on failure
   */
  public async confirmPasswordReset(oobCode: string, newPassword: string): Promise<string | undefined> {
    try {
      const email = await verifyPasswordResetCode(this.auth, oobCode);
      await confirmPasswordReset(this.auth, oobCode, newPassword);
      void this.activityService.log('auth', 'pwdresetConf', undefined, `${email}: SUCCESS`);
      return email;
    } catch (ex) {
      void this.activityService.log('auth', 'pwdresetConf', undefined, `ERROR: ${ex}`);
      console.error('AuthService.confirmPasswordReset: error: ', ex);
      return undefined;
    }
  }

  public async logout(currentUser: UserModel | undefined): Promise<boolean> {
    const msg = currentUser ? currentUser.bkey + ': ' + currentUser.firstName + ' ' + currentUser.lastName : 'undefined';
    const result = await this.alertService.confirm(this.i18n.logout_confirm(), true);
    if (result === true) {
      try {
        await signOut(this.auth);
        void this.activityService.log('auth', 'logout', currentUser, `${msg}: SUCCESS`);
        await this.alertService.showToast(this.i18n.logout_conf());
        return true;
      } catch (ex) {
        void this.activityService.log('auth', 'logout', currentUser, `${msg}: SUCCESS`);
        console.error('AuthService.logout: error: ', ex);
        await this.alertService.showToast(this.i18n.logout_error());
      }
    }
    return false;
  }

  /*-------------------------- helpers --------------------------------*/
  /**
   * Retrieve the uid of the user with the given login email.
   * This will fail if the user does not exist or the password is wrong.
   * @param loginEmail
   * @param password
   * @returns
   */
  public async getFirebaseUid(credentials: AuthCredentials): Promise<string | undefined> {
    if (!credentials.loginEmail || credentials.loginEmail.length === 0 || !credentials.loginPassword || !credentials.loginPassword) return undefined;
    try {
      const _fbCredentials = await signInWithEmailAndPassword(this.auth, credentials.loginEmail, credentials.loginPassword);
      return _fbCredentials.user.uid;
    } catch (ex) {
      warn(`AuthService.getFirebaseUid: error: ${ex}`);
      return undefined;
    }
  }
}
