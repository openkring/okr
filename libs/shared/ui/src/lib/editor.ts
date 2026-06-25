import { Component, OnDestroy, OnInit, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonIcon, IonItem, ToastController } from '@ionic/angular/standalone';
import { Editor, NgxEditorModule } from 'ngx-editor';
import { AsyncPipe } from '@angular/common';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';

import { ButtonCopyI18n } from './button-copy';
import { EditorToolbar } from './editor-toolbar';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-editor',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    NgxEditorModule, FormsModule,
    IonItem, IonIcon, IonButton
  ],
  styles: [`
    .editor {
      border: 1px solid var(--ion-color-step-200, #ccc);
      border-radius: 8px;
      overflow: hidden;
      background: var(--ion-background-color, #fff);
    }
    .editor:focus-within { border-color: var(--ion-color-primary, #3880ff); }
    ::ng-deep .NgxEditor__MenuBar {
      border-bottom: 1px solid var(--ion-color-step-150, #e0e0e0);
      background: var(--ion-color-step-50, #f7f7f7);
    }
    ::ng-deep {
      .NgxEditor {
        border: none !important; padding: 12px; min-height: 120px;
        @media (prefers-color-scheme: dark) { background-color: #2a2a2a !important; color: #fff !important; }
      }
    }
    .content {
      -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; user-select: text;
      h1 { line-height: 80px; color: #25265e;}
      h2, h3 { color: #25265e; margin-bottom: 12px; }
      p { margin-bottom: 24px; line-height: 24px; }
      ul { list-style-position: inside; padding-left: 20px; margin-bottom: 12px;}
    }
  `],
  template: `
      <div class="editor">
        @if(!isReadOnly()) {   <!-- editing mode -->
          <ngx-editor-menu [editor]="editor!" [toolbar]="toolbar" /> 
          <ngx-editor [editor]="editor!" [(ngModel)]="content" name="content" [disabled]=false [placeholder]="'Text...'" />
          <ion-item lines="none">
            @if (isClearable()) {
              <ion-button fill="clear" size="small" (click)="content.set('<p></p>')" tabindex="-1">
                <ion-icon slot="start" src="{{'cancel' | svgIcon }}" />
                {{ '@delete.label' | translate | async }}
              </ion-button>
            }
            @if (isCopyable()) {
              <ion-button fill="clear" size="small" (click)="copy()" tabindex="-1">
                <ion-icon slot="start" src="{{'copy' | svgIcon }}" />
                {{ '@copy.label' | translate | async }}
              </ion-button>

            }
          </ion-item>
        } @else {           <!-- viewing mode -->
          @if(content() && content().length > 0 && content() !== '<p></p>') {
            <ion-item lines="none">
              <div [innerHTML]="content()" class="content"></div>
            </ion-item>
          }
        }
      </div>
  `
})
export class BkEditor implements OnInit, OnDestroy {
  private toastController = inject(ToastController);

  // inputs
  public content = model('<p></p>'); // the HTML content
  public readOnly = input.required<boolean>();
  public buttonCopyI18n = input.required<ButtonCopyI18n>();
  public clearable = input(true); // show a button to clear the notes
  public copyable = input(true); // show a button to copy the notes

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isClearable = computed(() => coerceBoolean(this.clearable()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));

  public editor: Editor | undefined;
  protected toolbar = EditorToolbar;

  ngOnInit() {
    this.editor = new Editor({
      history: true,
      keyboardShortcuts: true,
      inputRules: false
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  public copy(): void {
    const value = this.content();
    if (value !== undefined && value !== null) {
      copyToClipboard(value);
      showToast(this.toastController, this.buttonCopyI18n().copy_conf);  
    }
  }
}
