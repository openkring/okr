import { Injectable, inject } from "@angular/core";
import { browserLocalPersistence, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ToastController } from "@ionic/angular";
import { Router } from "@angular/router";

import { AUTH } from "@bk2/shared/config";
import { bkTranslate } from "@bk2/shared/i18n";
import { die, navigateByUrl, showToast, warn } from "@bk2/shared/util";
import { AuthCredentials } from "@bk2/shared/models";

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
  private readonly toastController = inject(ToastController);
  private readonly router = inject(Router);

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
      if (!credentials.loginEmail || credentials.loginEmail.length === 0 || 
          !credentials.loginPassword || credentials.loginPassword.length === 0) die('AuthService.login: email and password are mandatory.');
      /*  browserLocalPersistence indicates that the state will be persisted even when the browser window is closed. 
          An explicit sign out is needed to clear that state. 
          Note that Firebase Auth web sessions are single host origin and will be persisted for a single domain only.
          see: https://firebase.google.com/docs/auth/web/auth-state-persistence
          browserLocalPersistence, browserSessionPersistence, inMemoryPersistence
      */
      await setPersistence(this.auth, browserLocalPersistence);
      await signInWithEmailAndPassword(this.auth, credentials.loginEmail, credentials.loginPassword);
      showToast(this.toastController, '@auth.operation.login.confirmation');
      await navigateByUrl(this.router, rootUrl);  
    } 
    catch(_ex) {
      console.error('AuthService.login: error: ', _ex);
      await showToast(this.toastController, '@auth.operation.login.error');
      await navigateByUrl(this.router, loginUrl)
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
      await sendPasswordResetEmail(this.auth, loginEmail);
      await showToast(this.toastController, bkTranslate('@auth.operation.pwdreset.confirmation') + loginEmail);
      await navigateByUrl(this.router, loginUrl)
    } 
    catch (_ex) {
      console.error('AuthService.resetPassword: error: ', _ex);
      await showToast(this.toastController, '@auth.operation.pwdreset.error');
      await navigateByUrl(this.router, loginUrl)
    }
  }

  public async logout(): Promise<boolean> {
    try {
      await signOut(this.auth);
      await showToast(this.toastController, '@auth.operation.logout.confirmation');
      return Promise.resolve(true);
    } 
    catch (_ex) {
      console.error('AuthService.logout: error: ', _ex);
      await showToast(this.toastController, '@auth.operation.logout.error');
      return Promise.resolve(false);
    }
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
    }
    catch(_ex) {
      warn(`AuthService.getFirebaseUid: error: ${_ex}`);
      return undefined;
    }
  }
}
