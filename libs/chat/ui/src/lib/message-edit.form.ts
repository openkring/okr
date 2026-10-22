import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular';

import { ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { MatrixChatI18n, MessageEditFormModel, messageEditValidations } from '@okr/chat-util';
import 'emoji-picker-element';

/**
 * Formular «Mitteilung ändern»: der Text der eigenen Mitteilung, und links unten der Smiley,
 * der dieselbe Emoji-Auswahl öffnet wie das Eingabefeld des Chats. Das Emoji landet an der
 * Cursor-Position (ein textarea behält seine Auswahl auch nach dem Blur).
 */
@Component({
  selector: 'okr-message-edit-form',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [TextareaInput, ErrorNote, SvgIconPipe, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .emoji-row { display: flex; justify-content: flex-start; padding: 0 8px 8px 8px; }
    .emoji-picker { padding: 0 8px 8px 8px; }
    emoji-picker { width: 100%; max-width: 420px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-textarea-input [i18n]="bodyI18n()" [value]="body()" (valueChange)="onFieldChange($event)"
                    [maxLength]="bodyLength" [rows]="4" [readOnly]="false" />
                  <okr-error-note [errors]="bodyErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
            <div class="emoji-row">
              <ion-button fill="clear" [attr.aria-label]="i18n().emoji_picker()" (click)="showEmojiPicker.set(!showEmojiPicker())">
                <ion-icon slot="icon-only" src="{{ 'smiley' | svgIcon }}" />
              </ion-button>
            </div>
            @if (showEmojiPicker()) {
              <div class="emoji-picker">
                <emoji-picker (emoji-click)="onEmojiClick($event)"></emoji-picker>
              </div>
            }
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class MessageEditForm {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly bodyLength = DESCRIPTION_LENGTH;

  // inputs
  public readonly i18n = input.required<MatrixChatI18n>();
  public formData = model.required<MessageEditFormModel>();
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly showEmojiPicker = signal(false);

  // signal form — wraps formData with Vest validation
  protected readonly editForm = form(this.formData, (path) => validateVestTree(path, messageEditValidations as any));
  private readonly validationResult = vestErrors(this.editForm);
  protected readonly bodyErrors = computed(() => this.validationResult().getErrors('body'));

  constructor() {
    effect(() => this.valid.emit(this.editForm().valid()));
  }

  protected readonly body = computed(() => this.formData()?.body ?? '');
  protected readonly bodyI18n = computed(() => ({
    name: 'body',
    label: this.i18n().msg_update_label(),
    placeholder: this.i18n().msg_update_placeholder(),
    helper: '',
  } as TextInputI18n));

  protected onFieldChange(body: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, body }));
  }

  /** Insert the emoji at the caret of the textarea (or append when it never had focus). */
  protected onEmojiClick(event: Event): void {
    const detail = (event as CustomEvent<{ unicode?: string; emoji?: { unicode?: string } }>).detail;
    const emoji = detail?.unicode ?? detail?.emoji?.unicode ?? '';
    if (!emoji) return;
    const current = this.body();
    const textarea = this.host.nativeElement.querySelector('textarea');
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    this.onFieldChange(current.slice(0, start) + emoji + current.slice(end));
    this.showEmojiPicker.set(false);
    const caret = start + emoji.length;
    // after the textarea took the new value, put the caret behind the emoji
    setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    }, 0);
  }
}
