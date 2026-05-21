import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonNote, IonTextarea } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { DESCRIPTION_LENGTH } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, decrypt, encrypt } from '@bk2/shared-util-core';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';
import { PFX } from './scope';

export interface NotesInputI18n {
  name: string;
  label: string;
  placeholder: string;
}

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
            [name]="i18n().name"
            [ngModel]="value()"
            (ngModelChange)="value.set($event)"
            placeholder="{{ i18n().placeholder }}"
            aria-label="{{ i18n().label }}"
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
            <bk-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
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
  public value = model.required<string>();
  public i18n = input.required<NotesInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(DESCRIPTION_LENGTH);
  public rows = input(5);
  public showTitle = input<boolean>(false);
  public title = input('');
  protected clearable = input(true);
  protected copyable = input(true);
  protected encryptable = input(true);
  public autoGrow = input(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected doShowTitle = computed(() => coerceBoolean(this.showTitle()));
  protected isClearable = computed(() => coerceBoolean(this.clearable()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected isEncryptable = computed(() => coerceBoolean(this.encryptable()));
  protected isAutoGrow = computed(() => coerceBoolean(this.autoGrow()));

  // i18n for dencrypt alert
  private readonly alertI18n = this.i18nService.translateAll({
    pwd_header:      PFX + 'notes.pwd.header',
    pwd_message:     PFX + 'notes.pwd.message',
    pwd_placeholder: PFX + 'notes.pwd.placeholder',
    cancel:          '@operation.cancel',
    ok:              '@operation.ok',
    copy_conf:       PFX + 'copy.conf',
  });
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.alertI18n.copy_conf() } as ButtonCopyI18n));

  private password = '';

  public clearValue(): void {
    this.value.set('');
  }

  public async dencrypt(): Promise<void> {
    if (!this.password || this.password.length === 0) {
      const alert = await this.alertController.create({
        header: this.alertI18n.pwd_header(),
        message: this.alertI18n.pwd_message(),
        inputs: [{
          name: 'PasswordPrompt',
          type: 'text',
          placeholder: this.alertI18n.pwd_placeholder()
        }],
        buttons: [{
          text: this.alertI18n.cancel(),
          role: 'cancel'
        }, {
          text: this.alertI18n.ok(),
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
