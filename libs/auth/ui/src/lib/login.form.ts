import { Component, computed, effect, linkedSignal, model, output, input } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AuthCredentials } from '@okr/shared-models';
import { EmailInput, EmailInputI18n, ErrorNote, PasswordInput, PasswordInputI18n } from '@okr/shared-ui';

import { authCredentialsValidations, AuthI18n } from '@okr/auth-util';

/**
 * We use this same form in three different contexts:
 * - login: Login (with loginEmail and loginPassword)
 * - email: PasswordReset (with only loginEmail)
 * - password: PasswordSet (with only loginPassword)
 * This way, we can make sure that we always apply the same input and validation rules (consistency).
 *
 * The three contexts are NOT cosmetic variants of one field pair. In the `password` context the
 * user is choosing a NEW password, which changes three things that all have to line up or the
 * browser's password manager works against us:
 *  - the password field asks for `new-password`, so iOS/Safari offers to GENERATE a strong one
 *    instead of autofilling the old one;
 *  - the account's email is rendered as a read-only `username` field, so the keychain has an
 *    account to attach the new entry to (a lone password field is saved under nothing);
 *  - the helper text drops the reference to the login screen's button, which does not exist here.
 */
@Component({
  selector: 'okr-login-form',
  standalone: true,
  imports: [
    EmailInput, PasswordInput, ErrorNote,
    IonGrid, IonRow, IonCol
  ],
  template: `
    <form novalidate>
      <ion-grid>
        @if (context(); as context) {
          @if (context === 'login' || context === 'email') {
            <ion-row>
              <ion-col size="12">
                <okr-email
                  [i18n]="loginEmailI18n()"
                  [value]="loginEmail()"
                  (valueChange)="onEmailChange($event)"
                  [autofocus]="true"
                  [copyable]="false"
                  [clearInput]="true"
                  [readOnly]="false"
                  autocomplete="username email"
                />
                <okr-error-note [errors]="emailErrors()" />
              </ion-col>
            </ion-row>
          }
          @if (context === 'password') {
            <!--
              Read-only, but a real field on purpose: iOS only saves a password when a username
              field sits in the same form. Without it the new password is either not offered for
              saving at all, or saved with no account to autofill it back into.
            -->
            <ion-row>
              <ion-col size="12">
                <okr-email
                  [i18n]="accountI18n()"
                  [value]="loginEmail()"
                  [copyable]="false"
                  [clearInput]="false"
                  [readOnly]="true"
                  autocomplete="username email"
                />
              </ion-col>
            </ion-row>
          }
          @if (context === 'login' || context === 'password') {
            <ion-row>
              <ion-col size="12">
                <okr-password-input
                  [i18n]="loginPasswordI18n()"
                  [value]="loginPassword()"
                  (valueChange)="onPasswordChange($event)"
                  [autocomplete]="context === 'password' ? 'new-password' : 'current-password'"
                />
                <okr-error-note [errors]="passwordErrors()" />
              </ion-col>
            </ion-row>
          }
        }
      </ion-grid>
    </form>
  `,
})
export class LoginForm {
  // inputs
  public readonly i18n = input.required<AuthI18n>();
  public readonly vm = model.required<AuthCredentials>(); // vm always contains the current values of the form
  public readonly context = input<'login' | 'email' | 'password'>('login');

  protected loginEmailI18n = computed(() => ({
    name: 'loginEmail',
    label: this.i18n().email_label(),
    placeholder: this.i18n().email_placeholder(),
    helper: this.i18n().email_helper()
  } as EmailInputI18n));
  /** The same control without the helper: on the set-password screen it is context, not input. */
  protected accountI18n = computed(() => ({
    name: 'account',
    label: this.i18n().account_label(),
    placeholder: '',
  } as EmailInputI18n));
  protected loginPasswordI18n = computed(() => {
    const isNew = this.context() === 'password';
    return {
      name: 'loginPassword',
      label: isNew ? this.i18n().password_new_label() : this.i18n().password_label(),
      placeholder: isNew ? this.i18n().password_new_placeholder() : this.i18n().password_placeholder(),
      helper: isNew ? this.i18n().password_new_helper() : this.i18n().password_helper()
    } as PasswordInputI18n;
  });

  public validChange = output<boolean>();

  // fields — read from vm; writes go back through handler methods
  protected loginEmail = linkedSignal(() => this.vm().loginEmail);
  protected loginPassword = linkedSignal(() => this.vm().loginPassword);

  constructor() {
    effect(() => this.validChange.emit(this.validationResult().isValid()));
  }

  protected onEmailChange(value: string): void {
    this.vm.update(v => ({ ...v, loginEmail: value }));
  }

  protected onPasswordChange(value: string): void {
    this.vm.update(v => ({ ...v, loginPassword: value }));
  }

  // errors — computed from vest validation result
  private readonly validationResult = computed(() =>
    authCredentialsValidations(this.vm(), undefined, this.context()),
  );
  protected emailErrors = computed(() => this.validationResult().getErrors('loginEmail'));
  protected passwordErrors = computed(() => this.validationResult().getErrors('loginPassword'));
}
