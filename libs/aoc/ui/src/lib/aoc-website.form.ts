import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { WebsiteContentModel } from '@okr/shared-models';
import { ButtonCopyI18n, Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { OkrEditor } from '@okr/shared-ui-editor';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { AocI18n, aocWebsiteValidations } from '@okr/aoc-util';

/** A website text (key + German/English text, plain or HTML). The parent modal drives saving. */
@Component({
  selector: 'okr-aoc-website-form',
  standalone: true,
  imports: [TextInput, Checkbox, NotesInput, ErrorNote, OkrEditor, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <!-- the key is chosen when the text is created and cannot be changed here -->
                  <okr-text-input [i18n]="keyI18n()" [value]="key()" [autofocus]="true" [readOnly]="true" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="isHtmlI18n()" [checked]="isHtml()" (checkedChange)="onFieldChange('isHtml', $event)"
                    [toggle]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  @if (isHtml()) {
                    <okr-editor [content]="de()" (contentChange)="onFieldChange('de', $event)"
                      [readOnly]="isReadOnly()" [buttonCopyI18n]="buttonCopyI18n()" />
                    <okr-error-note [errors]="deErrors()" />
                  } @else {
                    <okr-notes-input [i18n]="deI18n()" [value]="de()" (valueChange)="onFieldChange('de', $event)"
                      [embedded]="true" [fieldStyle]="true" [errors]="deErrors()" [readOnly]="isReadOnly()" />
                  }
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  @if (isHtml()) {
                    <okr-editor [content]="en()" (contentChange)="onFieldChange('en', $event)"
                      [readOnly]="isReadOnly()" [buttonCopyI18n]="buttonCopyI18n()" />
                    <okr-error-note [errors]="enErrors()" />
                  } @else {
                    <okr-notes-input [i18n]="enI18n()" [value]="en()" (valueChange)="onFieldChange('en', $event)"
                      [embedded]="true" [fieldStyle]="true" [errors]="enErrors()" [readOnly]="isReadOnly()" />
                  }
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class AocWebsiteForm {
  // inputs
  public readonly i18n = input.required<AocI18n>();
  public formData = model.required<WebsiteContentModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);   // toggled by the parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly websiteForm = form(this.formData, (path) => validateVestTree(path, aocWebsiteValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.websiteForm().valid()));
  }

  // fields
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly key = computed(() => this.formData()?.key ?? '');
  protected readonly isHtml = computed(() => this.formData()?.isHtml ?? false);
  protected readonly de = computed(() => this.formData()?.de ?? '');
  protected readonly en = computed(() => this.formData()?.en ?? '');

  // errors
  private readonly validationResult = vestErrors(this.websiteForm);
  protected readonly deErrors = computed(() => this.validationResult().getErrors('de'));
  protected readonly enErrors = computed(() => this.validationResult().getErrors('en'));

  // i18n
  protected readonly keyI18n = computed(() => ({
    name: 'key', label: this.i18n().website_key(), placeholder: '', helper: '',
  } as TextInputI18n));
  protected readonly isHtmlI18n = computed(() => ({
    name: 'isHtml', label: this.i18n().website_is_html(), helper: '',
  } as CheckboxI18n));
  protected readonly deI18n = computed(() => ({
    name: 'de', label: this.i18n().website_de_label(), placeholder: this.i18n().website_de_placeholder(),
  } as NotesInputI18n));
  protected readonly enI18n = computed(() => ({
    name: 'en', label: this.i18n().website_en_label(), placeholder: this.i18n().website_en_placeholder(),
  } as NotesInputI18n));
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));

  protected onFieldChange(fieldName: 'de' | 'en' | 'isHtml', fieldValue: string | boolean): void {
    // the HTML editor echoes its content back on init; only a real change makes the form dirty
    if (this.formData()?.[fieldName] === fieldValue) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
