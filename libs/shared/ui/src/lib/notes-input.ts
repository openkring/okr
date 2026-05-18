import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input, model } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonNote, IonTextarea } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';
import { switchMap } from 'rxjs';

import { DESCRIPTION_LENGTH } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, decrypt, encrypt } from '@bk2/shared-util-core';

import { ButtonCopy } from './button-copy';
import { PFX } from './scope';

/**
 * Vest updates work by binding to ngModel.
 * This works here for normal text changes in the ion-textarea.
 * But for the actions on the buttons (clear, d/encrypt) we need to additionally signal the changed result.
 */
@Component({
  selector: 'bk-notes-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    FormsModule,
    IonIcon, IonTextarea, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonNote,
    ButtonCopy
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  viewProviders: [vestFormsViewProviders],
  styles: [`
    ion-item.helper { --min-height: 0; }
    ion-card-content { padding: 0; }
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
  <ion-card>
    @if(doShowTitle()) {
      <ion-card-header>
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
    }
    <ion-card-content>

      @if(!isReadOnly()) {
        <ion-item lines="none">
          <ion-textarea
            type="text"
            [name]="name()"
            [ngModel]="value()"
            (ngModelChange)="value.set($event)"
            placeholder="{{ placeholder() }}"
            aria-label="{{ ariaLabel() }}"
            inputMode="text"
            [counter]="!isReadOnly()"
            fill="outline"
            [autoGrow]="isAutoGrow()"
            [maxlength]="maxLength()"
            [rows]="rows()" 
            [readonly]="isReadOnly()"
          />
          <!--
            labelPlacement="floating"
            label="{{'@input.' + name() + '.label' | translate | async }}"
            -->
        </ion-item>
        <ion-item lines="none">
          @if (isClearable()) {
            <ion-icon src="{{'cancel' | svgIcon }}" (click)="clearValue()" tabindex="-1" />
          }
          @if (isCopyable()) {
            <bk-button-copy [value]="value()" tabindex="-1" />
          }
          @if (isEncryptable()) {
            <ion-icon src="{{ 'key' | svgIcon }}" (click)="dencrypt()" tabindex="-1" />
          }
        </ion-item>
      } @else {
        <ion-item lines="none">
          <ion-note>{{value()}}</ion-note>
       </ion-item>
      }
    </ion-card-content>
  </ion-card>
  `
})
export class NotesInput {
  private readonly alertController = inject(AlertController);
  private readonly i18nService = inject(I18nService);

  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input('notes'); // name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(DESCRIPTION_LENGTH); // max number of characters allowed
  public rows = input(5); // number of rows
  public showTitle = input<boolean>(false);
  public title = input(PFX + 'notes.notes');
  protected clearable = input(true); // show a button to clear the notes
  protected copyable = input(true); // show a button to copy the notes
  protected encryptable = input(true); // show a button to encrypt or decrypt the notes
  public autoGrow = input(true); // if true, the input field grows with the content

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected doShowTitle = computed(() => coerceBoolean(this.showTitle()));
  protected isClearable = computed(() => coerceBoolean(this.clearable()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected isEncryptable = computed(() => coerceBoolean(this.encryptable()));
  protected isAutoGrow = computed(() => coerceBoolean(this.autoGrow()));

  // reactive i18n signals for dynamic keys
  protected readonly placeholder = toSignal(
    toObservable(this.name).pipe(switchMap(name => this.i18nService.translate(PFX + name + '.placeholder'))),
    { initialValue: '' }
  );
  protected readonly ariaLabel = toSignal(
    toObservable(this.name).pipe(switchMap(name => this.i18nService.translate(PFX + name + '.label'))),
    { initialValue: '' }
  );

  // static i18n strings for dencrypt alert
  private readonly i18n = this.i18nService.translateAll({
    pwd_header:      PFX + 'notes.pwd.header',
    pwd_message:     PFX + 'notes.pwd.message',
    pwd_placeholder: PFX + 'notes.pwd.placeholder',
    cancel:          '@operation.cancel',
    ok:              '@operation.ok',
  });

  private password = '';

  public clearValue(): void {
    this.value.set('');
  }

  public async dencrypt(): Promise<void> {
    if (!this.password || this.password.length === 0) {
      const alert = await this.alertController.create({
        header: this.i18n.pwd_header(),
        message: this.i18n.pwd_message(),
        inputs: [{
          name: 'PasswordPrompt',
          type: 'text',
          placeholder: this.i18n.pwd_placeholder()
        }],
        buttons: [{
          text: this.i18n.cancel(),
          role: 'cancel'
        }, {
          text: this.i18n.ok(),
          handler: (data) => {
            this.password = data['PasswordPrompt'];
            this.dencryptWithPassword(this.password);
          }
        }]
      });
      await alert.present();
    } else { // we already have a password
      this.dencryptWithPassword(this.password);
    }
  }

  private async dencryptWithPassword(password: string) {
    let value = this.value();
    if (value.startsWith('**')) { // text is encrypted -> decrypt it
      value = await decrypt(value.substring(2), password);
    }  else {  // text is plain -> encrypt it
      value = '**' + await encrypt(value, password);
    } 
    this.value.set(value);
  }
}
