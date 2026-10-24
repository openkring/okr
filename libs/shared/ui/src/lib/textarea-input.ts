import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonItem, IonNote, IonTextarea } from '@ionic/angular';

import { COMMENT_LENGTH } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';
import { HelperVisibility } from '@okr/shared-util-angular';

import { TextInputI18n } from './text-input';

/**
 * The multi-line twin of okr-text-input: same item, floating label, counter and helper —
 * plus an optional clear icon. For a plain free text; okr-notes-input is the heavier variant with its own
 * card, copy/clear and encryption.
 */
@Component({
  selector: 'okr-textarea-input',
  standalone: true,
  imports: [
    FormsModule,
    IonIcon, IonItem, IonNote, IonTextarea,
    SvgIconPipe
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none" [button]="false">
      <ion-textarea
        [name]="i18n().name"
        [ngModel]="value()" (ngModelChange)="onChange($event)"
        labelPlacement="floating"
        label="{{ i18n().label }}"
        placeholder="{{ i18n().placeholder }}"
        [counter]="!isReadOnly()"
        [maxlength]="maxLength()"
        [rows]="rows()"
        [autoGrow]="true"
        [readonly]="isReadOnly()"
      />
      @if(isClearable() && !isReadOnly() && value()) {
        <ion-icon slot="end" src="{{ 'cancel' | svgIcon }}" (click)="clearValue()" tabindex="-1" />
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class TextareaInput {
  private readonly helperVisibility = inject(HelperVisibility);
  public value = model.required<string>(); // mandatory view model, two-way bound

  // inputs
  public i18n = input.required<TextInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(COMMENT_LENGTH); // max number of characters allowed
  public rows = input(3); // initial height; the field grows with its content
  public showHelper = input(false);
  public clearable = input(false); // shows a clear icon while there is text

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => this.helperVisibility.showHelpers() && coerceBoolean(this.showHelper()));
  protected isClearable = computed(() => coerceBoolean(this.clearable()));

  /** set() on the model already emits `valueChange` — no manual emit, that would fire twice. */
  protected onChange(newValue: string): void {
    this.value.set(newValue);
  }

  protected clearValue(): void {
    this.value.set('');
  }
}
