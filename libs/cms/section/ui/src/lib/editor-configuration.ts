import { Component, ComponentRef, computed, DestroyRef, effect, inject, input, linkedSignal, model, PLATFORM_ID, Signal, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonNote, IonRow, IonSegment, IonSegmentButton, IonSelect, IonSelectOption } from '@ionic/angular';

import { EditorConfig, ViewPosition } from '@okr/shared-models';
import { ButtonCopyI18n, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { isBrowser } from '@okr/shared-util-angular';
import type { OkrEditor } from '@okr/shared-ui-editor';

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
    NumberInput
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
                <div #editorHost></div>
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // inputs
  public formData = model.required<EditorConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly showAdvanced = input(false);
  /** position and column size of the images; the article edits them in its «Bilder» card instead (spec 1.154 §5) */
  public readonly showLayout = input(true);
  public readonly i18n = input.required<EditorConfigI18n>();

  // derived
  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));
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

  // Lazy: a static import of @okr/shared-ui-editor drags ngx-editor/ProseMirror into every
  // page that reaches this component (spec 1.49, F1) — the same shape as calendar-section.ts's
  // dynamic FullCalendar creation.
  private editorHost = viewChild('editorHost', { read: ViewContainerRef });
  protected readonly ref = signal<ComponentRef<OkrEditor> | undefined>(undefined);
  /** Guards against a second mount while the chunk is still in flight. */
  private creatingEditor = false;

  constructor() {
    // Pattern A (lazy-loading skill): the effect body stays synchronous and starts the async work
    // itself. `effect(async …)` would hand Angular a promise it ignores, and every signal read
    // after the first await lands outside the tracking context.
    effect(() => {
      const host = this.editorHost();
      // The host view can be torn down and remounted (Angular destroys the OkrEditor with it) —
      // drop the stale ref so the next mount recreates the component instead of staying empty.
      // Same branch as email-composer.modal.ts, which needs it for revert().
      if (!host) {
        if (untracked(() => this.ref())) this.ref.set(undefined);
        return;
      }
      // `creating` closes the window the ref guard alone leaves open: between starting the import
      // and setting the ref, a second run would pass the guard and mount a second component.
      if (untracked(() => this.ref()) || this.creatingEditor || !isBrowser(this.platformId)) return;
      this.creatingEditor = true;
      void (async () => {
        try {
          const { OkrEditor } = await import('@okr/shared-ui-editor');
          const componentRef = host.createComponent(OkrEditor);
          this.ref.set(componentRef);
          // `content` is a model() — it doubles as the OkrEditor -> here change channel.
          componentRef.instance.content.subscribe((value: string) => this.onFieldChange('htmlContent', value));
        } finally {
          this.creatingEditor = false;
        }
      })();
    });
    effect(() => {
      const componentRef = this.ref();
      const content = this.htmlContent();
      const readOnly = this.readOnly();
      const buttonCopyI18n = this.buttonCopyI18n();
      if (!componentRef) return;
      componentRef.setInput('content', content);
      componentRef.setInput('readOnly', readOnly);
      componentRef.setInput('buttonCopyI18n', buttonCopyI18n);
    });
    this.destroyRef.onDestroy(() => this.ref()?.destroy());
  }

    /******************************* actions *************************************** */
  protected onSegmentChange(value: unknown): void {
    if (value === 'editor' || value === 'layout') this.segment.set(value);
  }

  protected onFieldChange(fieldName: string, $event: string | number | ViewPosition): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
