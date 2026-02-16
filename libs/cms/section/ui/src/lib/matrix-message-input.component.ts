import { Component, computed, inject, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {  IonTextarea, IonButton, IonIcon, ActionSheetController } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-matrix-message-input',
  standalone: true,
  imports: [
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
        (click)="presentAttachmentActions()"
      >
        <ion-icon slot="icon-only" name="add-circle-outline"></ion-icon>
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
              <ion-icon slot="icon-only" name="close"></ion-icon>
            </ion-button>
          </div>
        }

        <!-- Text input -->
        <ion-textarea
          #textInput
          [(ngModel)]="messageText"
          [placeholder]="placeholder()"
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
        <ion-icon slot="icon-only" name="send"></ion-icon>
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
export class MatrixMessageInputComponent {
  private actionSheetController = inject(ActionSheetController);

  placeholder = input<string>('Type a message...');
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

  async presentAttachmentActions() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Add attachment',
      buttons: [
        {
          text: 'Photo or Video',
          icon: 'image-outline',
          handler: () => {
            this.selectFile('image/*,video/*');
          }
        },
        {
          text: 'File',
          icon: 'document-outline',
          handler: () => {
            this.selectFile('*/*');
          }
        },
        {
          text: 'Send Location',
          icon: 'location-outline',
          handler: () => {
            this.locationSent.emit();
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
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
    if (users.length === 1) return `${users[0]} is typing...`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
    return `${users[0]} and ${users.length - 1} others are typing...`;
  }

  focus() {
    const textarea = this.textInput()?.nativeElement?.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }
}
