import { Component, computed, inject, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {  IonTextarea, IonButton, IonIcon, ActionSheetController, ActionSheetOptions } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { AppStore } from '@bk2/shared-feature';

@Component({
  selector: 'bk-matrix-message-input',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    CommonModule, FormsModule,
    IonTextarea, IonButton, IonIcon
  ],
  styles: [`
    :host {
      display: block;
      background: var(--ion-background-color);
      border-top: 1px solid var(--ion-border-color, #dedede);
    }

    .input-container {
      display: flex;
      align-items: flex-end;
      padding: 8px;
      gap: 8px;
    }

    .input-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--ion-color-light);
      border-radius: 20px;
      overflow: hidden;
    }

    .reply-preview {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--ion-color-light-shade);
      border-bottom: 1px solid var(--ion-border-color);
      font-size: 0.875rem;
    }

    .reply-content {
      flex: 1;
      min-width: 0;
    }

    .reply-label {
      font-weight: 600;
      color: var(--ion-color-primary);
      font-size: 0.75rem;
    }

    .reply-text {
      color: var(--ion-color-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    ion-textarea {
      --padding-start: 12px;
      --padding-end: 12px;
      --padding-top: 10px;
      --padding-bottom: 10px;
      min-height: 40px;
      max-height: 120px;
    }

    .action-button {
      --padding-start: 12px;
      --padding-end: 12px;
      margin: 0;
    }

    .send-button {
      --background: var(--ion-color-primary);
      --border-radius: 50%;
      width: 40px;
      height: 40px;
      margin: 0;
    }

    .typing-indicator {
      padding: 4px 12px;
      font-size: 0.75rem;
      color: var(--ion-color-medium);
      font-style: italic;
    }

    .file-input {
      display: none;
    }
  `],
  template: `
    <div class="input-container">
      <!-- Attachment button -->
      <ion-button
        fill="clear"
        class="action-button"
        (click)="showActions()"
      >
        <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon}}"></ion-icon>
      </ion-button>

      <div class="input-wrapper">
        <!-- Reply preview -->
        @if (replyToMessage()) {
          <div class="reply-preview">
            <div class="reply-content">
              <div class="reply-label">Replying to {{ replyToMessage()?.senderName }}</div>
              <div class="reply-text">{{ replyToMessage()?.body }}</div>
            </div>
            <ion-button
              fill="clear"
              size="small"
              (click)="cancelReply()"
            >
              <ion-icon slot="icon-only" src="{{'close-cancel-circle' | svgIcon}}"></ion-icon>
            </ion-button>
          </div>
        }

        <!-- Text input -->
        <ion-textarea
          #textInput
          [(ngModel)]="messageText"
          placeholder="{{ '@chat.fields.typeMessage' | translate | async }}"
          [rows]="1"
          [autoGrow]="true"
          (ionInput)="onTyping()"
          (keydown.enter)="onEnterKey($event)"
        ></ion-textarea>
      </div>

      <!-- Send button -->
      <ion-button
        class="send-button"
        [disabled]="!canSend()"
        (click)="sendMessage()"
      >
        <ion-icon slot="icon-only" src="{{'send' | svgIcon}}"></ion-icon>
      </ion-button>
    </div>

    @if (typingUsers().length > 0) {
      <div class="typing-indicator">
        {{ getTypingText() }}
      </div>
    }

    <!-- Hidden file input -->
    <input
      #fileInput
      type="file"
      class="file-input"
      (change)="onFileSelected($event)"
      [accept]="fileAccept()"
    />
  `
})
export class MatrixMessageInput {
  private actionSheetController = inject(ActionSheetController);
  private appStore = inject(AppStore);

  disabled = input<boolean>(false);
  typingUsers = input<string[]>([]);
  replyToMessage = input<any>();
  fileAccept = input<string>('*/*');

  messageSent = output<string>();
  fileSent = output<File>();
  locationSent = output<void>();
  typing = output<boolean>();
  cancelReplyClicked = output<void>();

  messageText = signal<string>('');
  private typingTimeout: any;

  textInput = viewChild<ElementRef>('textInput');
  fileInputRef = viewChild<ElementRef>('fileInput');

  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  canSend = computed(() => {
    return this.messageText().trim().length > 0 && !this.disabled();
  });

  sendMessage() {
    const text = this.messageText().trim();
    if (text) {
      this.messageSent.emit(text);
      this.messageText.set('');
      this.typing.emit(false);
    }
  }

  onEnterKey(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    // Send on Enter, new line on Shift+Enter
    if (!keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onTyping() {
    // Emit typing notification
    this.typing.emit(true);

    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Stop typing after 3 seconds of no input
    this.typingTimeout = setTimeout(() => {
      this.typing.emit(false);
    }, 3000);
  }

  /******************************* actions *************************************** */
  /**
   * Displays an ActionSheet with all possible actions on a chat message. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param attendee 
   */
  protected async showActions(): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@chat.fields.addAttachment');
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.image', this.imgixBaseUrl, 'image'));
    actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.file', this.imgixBaseUrl, 'document'));
    actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.position', this.imgixBaseUrl, 'location'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'chat.attachment.image':
          this.selectFile('image/*,video/*');
          break;
        case 'chat.attachment.file':
            this.selectFile('*/*');
          break;
        case 'chat.attachment.position':
            this.locationSent.emit();
        break;
      }
    }
  }

  selectFile(accept: string) {
    const input = this.fileInputRef()?.nativeElement as HTMLInputElement;
    if (input) {
      input.accept = accept;
      input.click();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      this.fileSent.emit(file);
      // Reset file input
      input.value = '';
    }
  }

  cancelReply() {
    this.cancelReplyClicked.emit();
  }

  getTypingText(): string {
    const users = this.typingUsers();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0]} ${bkTranslate('@chat.fields.isTypeing')}`;
    if (users.length === 2) return `${users[0]} ${bkTranslate('@chat.fields.and')} ${users[1]} ${bkTranslate('@chat.fields.areTypeing')}`;
    return `${users[0]} ${bkTranslate('@chat.fields.and')} ${users.length - 1} ${bkTranslate('@chat.fields.othersTypeing')}}`;
  }

  focus() {
    const textarea = this.textInput()?.nativeElement?.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }
}
