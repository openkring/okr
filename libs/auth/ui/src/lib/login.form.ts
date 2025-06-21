import { Component, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';

import { EmailInputComponent, ErrorNoteComponent, PasswordInputComponent } from '@bk2/shared/ui';
import { AuthCredentials, authCredentialsShape } from '@bk2/shared/models';

import { authCredentialsValidations } from '@bk2/auth/util';

@Component({
  selector: 'bk-login-form',
  imports: [
    vestForms, FormsModule,
    IonGrid, IonRow, IonCol,
    EmailInputComponent, PasswordInputComponent,
    ErrorNoteComponent
  ],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="vm()"
      [suite]="suite" 
      (formValueChange)="onValueChange($event)">
      <ion-grid>
        <ion-row>
          <ion-col size="12">
            <bk-email name="loginEmail" [value]="vm().loginEmail ?? ''" [showHelper]=true autocomplete="username email" />
            <bk-error-note [errors]="emailErrors()" />
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <bk-password-input name="loginPassword" [value]="vm().loginPassword ?? ''" [showHelper]=true />
            <bk-error-note [errors]="passwordErrors()" />
          </ion-col>
        </ion-row>
      </ion-grid>
    </form>
`
})
export class LoginFormComponent {
  public readonly vm = model.required<AuthCredentials>();  // vm always contains the current values of the form
  public readonly suite = authCredentialsValidations;
  protected readonly shape = authCredentialsShape;
  public validChange = output<boolean>();

  protected emailErrors = signal<string[]>([]);
  protected passwordErrors = signal<string[]>([]);

  protected onValueChange(value: AuthCredentials): void {
    this.vm.set(value);
    const _result = authCredentialsValidations(this.vm());
    this.emailErrors.set(_result.getErrors('loginEmail'));
    this.passwordErrors.set(_result.getErrors('loginPassword'));
    this.validChange.emit(_result.isValid());
  }
}