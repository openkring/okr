import { AsyncPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonIcon, IonItem } from '@ionic/angular/standalone';
import { Editor, NgxEditorModule } from 'ngx-editor';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';

import { EditorToolbar } from './editor-toolbar.component';
import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-editor',
  viewProviders: [vestFormsViewProviders],
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    NgxEditorModule, FormsModule,
    IonItem, IonIcon, IonButton,
    ButtonCopyComponent
  ],
  styles: [`
  ::ng-deep {
    .NgxEditor { 
      border: none !important; padding: 0;
      @media (prefers-color-scheme: dark) { background-color: #333 !important; color: #fff !important; }
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
        @if(!readOnly()) {   <!-- editing mode -->
          <ngx-editor-menu [editor]="editor!" [toolbar]="toolbar" /> 
          <ngx-editor [editor]="editor!" [(ngModel)]="content" name="content" [disabled]=false [placeholder]="'Text...'" />
          <ion-item lines="none">
            @if (clearable()) {
              <ion-button fill="clear" (click)="content.set('<p></p>')">
                <ion-icon slot="start" src="{{'close_cancel' | svgIcon }}" />
                {{ '@general.operation.deleteContent' | translate | async }}
              </ion-button>
            }
            @if (copyable()) {
              <bk-button-copy [value]="content()" [label]="'@general.operation.copy.label'" />
            }
          </ion-item>
        } @else {           <!-- viewing mode -->
          @if(content() && content().length > 0 && content() !== '<p></p>') {
            <ion-item lines="none">
              <div [innerHTML]="content()" class="content"></div>
            </ion-item>
            <!-- <ngx-editor [editor]="editor!" [ngModel]="content" [disabled]="readOnly()" [placeholder]="'Text...'" /> -->
          }
        }
      </div>
  `
})
export class EditorComponent implements OnInit, OnDestroy {
  public content = model('');
  public readOnly = input(true);
  public clearable = input(true); // show a button to clear the notes
  public copyable = input(true); // show a button to copy the notes

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
}