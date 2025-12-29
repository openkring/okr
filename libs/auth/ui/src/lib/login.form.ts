import { Component, computed, linkedSignal, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AuthCredentials, AUTH_CREDENTIAL_SHAPE } from '@bk2/shared-models';
import { EmailInputComponent, ErrorNoteComponent, PasswordInputComponent } from '@bk2/shared-ui';

import { authCredentialsValidations } from '@bk2/auth-util';

@Component({
  selector: 'bk-login-form',
  standalone: true,
  imports: [vestForms, FormsModule, IonGrid, IonRow, IonCol, EmailInputComponent, PasswordInputComponent, ErrorNoteComponent],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="vm()"
      [suite]="suite"
      (formValueChange)="onFormChange($event)">
      <ion-grid>
        <ion-row>
          <ion-col size="12">
            <bk-email name="loginEmail" [(value)]="loginEmail" [showHelper]="true" [readOnly]="false" autocomplete="username email" />
            <bk-error-note [errors]="emailErrors()" />
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <bk-password-input name="loginPassword" [(value)]="loginPassword" [showHelper]="true" />
            <bk-error-note [errors]="passwordErrors()" />
          </ion-col>
        </ion-row>
      </ion-grid>
    </form>
  `,
})
export class LoginFormComponent {
  // inputs
  public readonly vm = model.required<AuthCredentials>(); // vm always contains the current values of the form
  public readonly suite = authCredentialsValidations;
  protected readonly shape = AUTH_CREDENTIAL_SHAPE;
  public validChange = output<boolean>();

  // fields
  protected loginEmail = linkedSignal(() => this.vm().loginEmail);
  protected loginPassword = linkedSignal(() => this.vm().loginPassword);

  // errors
  protected emailErrors = signal<string[]>([]);
  protected passwordErrors = signal<string[]>([]);

  protected onFormChange(value: AuthCredentials): void {
    this.vm.set(value);
    const result = authCredentialsValidations(this.vm());
    this.emailErrors.set(result.getErrors('loginEmail'));
    this.passwordErrors.set(result.getErrors('loginPassword'));
    this.validChange.emit(result.isValid());
  }
}
