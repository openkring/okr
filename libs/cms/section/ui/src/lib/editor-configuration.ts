import { Component, computed, input, linkedSignal, model, Signal, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonNote, IonRow, IonSegment, IonSegmentButton, IonSelect, IonSelectOption } from '@ionic/angular';

import { EditorConfig, ViewPosition } from '@okr/shared-models';
import { NumberInput, NumberInputI18n, TextareaInputI18n } from '@okr/shared-ui';
import { RichTextInput } from '@okr/shared-ui-editor';

interface EditorConfigI18n {
  editor_title:               Signal<string>;
  editor_colSize_label:       Signal<string>;
  editor_colSize_placeholder: Signal<string>;
  editor_colSize_helper:      Signal<string>;
  editor_segment_editor:      Signal<string>;
  editor_segment_layout:      Signal<string>;
  button_position_label:      Signal<string>;
  button_position_helper:     Signal<string>;
  button_position_none:       Signal<string>;
  button_position_top:        Signal<string>;
  button_position_bottom:     Signal<string>;
  button_position_left:       Signal<string>;
  button_position_right:      Signal<string>;
  copy_conf:                  Signal<string>;
}

@Component({
  selector: 'okr-editor-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote, IonLabel,
    IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
    NumberInput, RichTextInput
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().editor_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <!-- the Layout segment exists only where this card positions the text (the button section) -->
        @if (hasLayout()) {
          <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)">
            <ion-segment-button value="editor">
              <ion-label>{{ i18n().editor_segment_editor() }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="layout">
              <ion-label>{{ i18n().editor_segment_layout() }}</ion-label>
            </ion-segment-button>
          </ion-segment>
        }
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <ion-note>{{ intro }}</ion-note>
          }
        }
        <ion-grid>
          <ion-row>
            @if (segment() === 'editor' || !hasLayout()) {
              <ion-col size="12">
                <okr-rich-text-input [i18n]="editorI18n" [value]="htmlContent()" (valueChange)="onFieldChange('htmlContent', $event)"
                  [readOnly]="readOnly()" [copyable]="true" />
              </ion-col>
            } @else {
              <ion-col size="12">
                <ion-select [label]="i18n().button_position_label()" labelPlacement="stacked" interface="popover"
                            [value]="position()" [disabled]="readOnly()"
                            (ionChange)="onFieldChange('position', $event.detail.value)">
                  @for (p of positions; track p) {
                    <ion-select-option [value]="p">{{ positionLabels()[p] }}</ion-select-option>
                  }
                </ion-select>
                <ion-note>{{ i18n().button_position_helper() }}</ion-note>
              </ion-col>
              <!-- the column size only applies when button and text stand side by side -->
              @if (position() === VP.Left || position() === VP.Right) {
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="colSizeI18n()" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                </ion-col>
              }
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EditorConfiguration {
  // inputs
  public formData = model.required<EditorConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly showAdvanced = input(false);
  /** position and column size of the images; the article edits them in its «Bilder» card instead (spec 1.154 §5) */
  public readonly showLayout = input(true);
  public readonly i18n = input.required<EditorConfigI18n>();

  // derived
  /** the card title names the text; the editor itself carries no extra label */
  protected readonly editorI18n: TextareaInputI18n = { name: 'htmlContent', label: '', placeholder: '' };
  protected colSizeI18n = computed(() => ({ name: 'colSize', label: this.i18n().editor_colSize_label(), placeholder: this.i18n().editor_colSize_placeholder(), helper: this.i18n().editor_colSize_helper() } as NumberInputI18n));
  /** where the button stands relative to the text (button-section.ts renders exactly these five) */
  protected positionLabels = computed<Record<ViewPosition, string>>(() => ({
    [ViewPosition.None]: this.i18n().button_position_none(),
    [ViewPosition.Top]: this.i18n().button_position_top(),
    [ViewPosition.Bottom]: this.i18n().button_position_bottom(),
    [ViewPosition.Left]: this.i18n().button_position_left(),
    [ViewPosition.Right]: this.i18n().button_position_right(),
  }));
  protected readonly hasLayout = computed(() => this.showAdvanced() && this.showLayout());
  protected readonly segment = signal<'editor' | 'layout'>('editor');

  // fields
  protected htmlContent = linkedSignal(() => this.formData().htmlContent ?? '<p></p>');
  protected colSize = linkedSignal(() => this.formData().colSize ?? 6)   // button-section.ts renders 6 when unset;
  protected position = linkedSignal(() => this.formData().position ?? ViewPosition.None);

  // passing constants to template
  protected readonly positions = [ViewPosition.None, ViewPosition.Top, ViewPosition.Bottom, ViewPosition.Left, ViewPosition.Right];
  protected readonly VP = ViewPosition;

    /******************************* actions *************************************** */
  protected onSegmentChange(value: unknown): void {
    if (value === 'editor' || value === 'layout') this.segment.set(value);
  }

  protected onFieldChange(fieldName: string, $event: string | number | ViewPosition): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
