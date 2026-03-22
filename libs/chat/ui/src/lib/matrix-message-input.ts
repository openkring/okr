import { Component, computed, inject, input, output, signal, viewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {  IonTextarea, IonButton, IonIcon, ActionSheetController, ActionSheetOptions } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { AppStore } from '@bk2/shared-feature';
import 'emoji-picker-element';

@Component({
  selector: 'bk-matrix-message-input',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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

    .record-button {
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

    .emoji-picker-wrapper {
      position: relative;
    }

    .emoji-picker-popover {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      z-index: 1000;
    }

    /* Recording bar replaces the normal input row while recording */
    .recording-container {
      display: flex;
      align-items: center;
      padding: 8px;
      gap: 8px;
    }

    .recording-indicator {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--ion-color-danger-tint);
      border-radius: 20px;
      padding: 8px 16px;
    }

    .recording-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ion-color-danger);
      animation: blink 1s step-start infinite;
      flex-shrink: 0;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0; }
    }

    .recording-duration {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--ion-color-danger);
      min-width: 40px;
    }

    .recording-label {
      font-size: 0.875rem;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    <!-- Normal input row (hidden while recording) -->
    @if (!isRecording()) {
      <div class="input-container">
        <!-- Attachment button -->
        <ion-button
          fill="clear"
          class="action-button"
          (click)="showActions()"
        >
          <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon}}"></ion-icon>
        </ion-button>

        <!-- Emoji picker button -->
        <div class="emoji-picker-wrapper">
          <ion-button
            fill="clear"
            class="action-button"
            (click)="toggleEmojiPicker($event)"
            title="Emoji"
          >
            <ion-icon slot="icon-only" src="{{'smiley' | svgIcon}}"></ion-icon>
          </ion-button>
          @if (showEmojiPicker()) {
            <div class="emoji-picker-popover">
              <emoji-picker (emoji-click)="onEmojiClick($event)"></emoji-picker>
            </div>
          }
        </div>

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

        <!-- Mic button to start recording -->
        <ion-button
          fill="clear"
          class="record-button"
          (click)="startRecording()"
          title="{{ '@chat.fields.recordAudio' | translate | async }}"
        >
          <ion-icon slot="icon-only" src="{{'mic' | svgIcon}}"></ion-icon>
        </ion-button>

        <!-- Video call button -->
        <ion-button
          fill="clear"
          class="record-button"
          (click)="videoCallStarted.emit()"
          title="{{ '@chat.fields.videoCall' | translate | async }}"
        >
          <ion-icon slot="icon-only" src="{{'video' | svgIcon}}"></ion-icon>
        </ion-button>

        <!-- Send button -->
        <ion-button
          class="send-button"
          [disabled]="!canSend()"
          (click)="sendMessage()"
        >
          <ion-icon slot="icon-only" src="{{'send' | svgIcon}}"></ion-icon>
        </ion-button>
      </div>
    }

    <!-- Recording row -->
    @if (isRecording()) {
      <div class="recording-container">
        <!-- Cancel recording -->
        <ion-button
          fill="clear"
          class="action-button"
          color="medium"
          (click)="cancelRecording()"
        >
          <ion-icon slot="icon-only" src="{{'close_cancel' | svgIcon}}"></ion-icon>
        </ion-button>

        <!-- Recording indicator -->
        <div class="recording-indicator">
          <span class="recording-dot"></span>
          <span class="recording-duration">{{ formatRecordingDuration(recordingSeconds()) }}</span>
          <span class="recording-label">{{ '@chat.fields.recording' | translate | async }}</span>
        </div>

        <!-- Stop & send recording -->
        <ion-button
          class="record-button"
          color="danger"
          (click)="stopRecording()"
        >
          <ion-icon slot="icon-only" src="{{'send' | svgIcon}}"></ion-icon>
        </ion-button>
      </div>
    }

    @if (typingUsers().length > 0 && !isRecording()) {
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
  videoCallStarted = output<void>();
  typing = output<boolean>();
  cancelReplyClicked = output<void>();

  messageText = signal<string>('');
  showEmojiPicker = signal<boolean>(false);
  private typingTimeout: any;

  textInput = viewChild<ElementRef>('textInput');
  fileInputRef = viewChild<ElementRef>('fileInput');

  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  // ─── recording state ──────────────────────────────────────────────────────
  isRecording = signal(false);
  recordingSeconds = signal(0);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;

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

  // ─── audio recording ───────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer opus in webm (best compression), fall back to whatever the browser supports
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
        .find(t => !t || MediaRecorder.isTypeSupported(t)) ?? '';

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); // release mic
        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType ?? 'audio/webm' });
        const ext = (this.mediaRecorder?.mimeType ?? '').includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
        this.fileSent.emit(file);
        this.isRecording.set(false);
        this.recordingSeconds.set(0);
        if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
      };

      this.mediaRecorder.start(250); // collect chunks every 250ms
      this.isRecording.set(true);
      this.recordingSeconds.set(0);
      this.recordingTimer = setInterval(() => this.recordingSeconds.update(s => s + 1), 1000);

    } catch (err) {
      console.error('MatrixMessageInput: microphone access denied or unavailable', err);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop(); // triggers onstop → emits file
    }
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Override onstop so we don't emit the file
      this.mediaRecorder.onstop = () => {
        this.mediaRecorder?.stream?.getTracks().forEach(t => t.stop());
      };
      this.mediaRecorder.stop();
    }
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
    this.isRecording.set(false);
    this.recordingSeconds.set(0);
    this.audioChunks = [];
  }

  formatRecordingDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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

  toggleEmojiPicker(event: Event): void {
    event.stopPropagation();
    this.showEmojiPicker.update(v => !v);
    if (this.showEmojiPicker()) {
      // Close picker when clicking outside
      const close = () => {
        this.showEmojiPicker.set(false);
        document.removeEventListener('click', close);
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  }

  onEmojiClick(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const emoji: string = detail?.unicode ?? '';
    if (!emoji) return;

    const textarea = this.textInput()?.nativeElement?.querySelector('textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart ?? this.messageText().length;
      const end = textarea.selectionEnd ?? start;
      const current = this.messageText();
      this.messageText.set(current.slice(0, start) + emoji + current.slice(end));
      // Restore cursor position after Angular updates the DOM
      setTimeout(() => {
        const pos = start + emoji.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      }, 0);
    } else {
      this.messageText.update(t => t + emoji);
    }
    this.showEmojiPicker.set(false);
  }
}
