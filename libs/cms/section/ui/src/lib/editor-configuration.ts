import { Component, ComponentRef, computed, DestroyRef, effect, inject, input, linkedSignal, model, PLATFORM_ID, Signal, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ViewPositions } from '@okr/shared-categories';
import { EditorConfig, ViewPosition } from '@okr/shared-models';
import { ButtonCopyI18n, CategoryOld, CategoryOldI18n, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { isBrowser } from '@okr/shared-util-angular';
import type { OkrEditor } from '@okr/shared-ui-editor';

interface EditorConfigI18n {
  editor_title:               Signal<string>;
  editor_colSize_label:       Signal<string>;
  editor_colSize_placeholder: Signal<string>;
  editor_colSize_helper:      Signal<string>;
  editor_position_label:      Signal<string>;
  copy_conf:                  Signal<string>;
}

@Component({
  selector: 'okr-editor-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    NumberInput, CategoryOld
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().editor_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <ion-note>{{ intro }}</ion-note>
          }
        }
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <div #editorHost></div>
            </ion-col>
            @if(showAdvanced()) {
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="positionI18n()" [value]="position()" (valueChange)="onFieldChange('position', $event)" [readOnly]="readOnly()" [categories]="positions" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-number-input [i18n]="colSizeI18n()" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="readOnly()" [showHelper]="true" />
              </ion-col>
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
  public readonly i18n = input.required<EditorConfigI18n>();

  // derived
  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));
  protected colSizeI18n = computed(() => ({ name: 'colSize', label: this.i18n().editor_colSize_label(), placeholder: this.i18n().editor_colSize_placeholder(), helper: this.i18n().editor_colSize_helper() } as NumberInputI18n));
  protected positionI18n = computed(() => ({ name: 'position', label: this.i18n().editor_position_label() } as CategoryOldI18n));

  // fields
  protected htmlContent = linkedSignal(() => this.formData().htmlContent ?? '<p></p>');
  protected colSize = linkedSignal(() => this.formData().colSize ?? 4);
  protected position = linkedSignal(() => this.formData().position ?? ViewPosition.None);

  // passing constants to template
  protected positions = ViewPositions;

  // Lazy: a static import of @okr/shared-ui-editor drags ngx-editor/ProseMirror into every
  // page that reaches this component (spec 1.49, F1) — the same shape as calendar-section.ts's
  // dynamic FullCalendar creation.
  private editorHost = viewChild('editorHost', { read: ViewContainerRef });
  protected readonly ref = signal<ComponentRef<OkrEditor> | undefined>(undefined);

  constructor() {
    effect(async () => {
      const host = this.editorHost();
      if (!host || untracked(() => this.ref()) || !isBrowser(this.platformId)) return;
      const { OkrEditor } = await import('@okr/shared-ui-editor');
      const componentRef = host.createComponent(OkrEditor);
      this.ref.set(componentRef);
      // `content` is a model() — it doubles as the OkrEditor -> here change channel.
      componentRef.instance.content.subscribe((value: string) => this.onFieldChange('htmlContent', value));
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
  protected onFieldChange(fieldName: string, $event: string | number | ViewPosition): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
