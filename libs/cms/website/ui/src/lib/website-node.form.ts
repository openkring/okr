import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular';

import { URL_LENGTH } from '@okr/shared-constants';
import { Checkbox, CheckboxI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { LABEL_LENGTH, WebsiteI18n, WebsiteNodeFormModel, websiteNodeValidations } from '@okr/cms-website-util';

/**
 * One node of the website navigation: a label for every type, the slug of a page node, the url
 * and style of a link node. The parent modal drives saving through the change-confirmation.
 */
@Component({
  selector: 'okr-website-node-form',
  standalone: true,
  imports: [TextInput, Checkbox, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()"
                    (valueChange)="onFieldChange('label', $event)"
                    [autofocus]="true" [maxLength]="labelLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="labelErrors()" />
                </ion-col>
                @if (type() === 'page') {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="slugI18n()" [value]="slug()"
                      (valueChange)="onFieldChange('slug', $event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="slugErrors()" />
                    @if (slugChanged()) {
                      <ion-note color="warning">{{ i18n().slug_rename_hint() }}</ion-note>
                    }
                  </ion-col>
                }
                @if (type() === 'link') {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="urlI18n()" [value]="url()"
                      (valueChange)="onFieldChange('url', $event)"
                      [maxLength]="urlLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="urlErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="styleI18n()" [checked]="isButton()"
                      (checkedChange)="onFieldChange('style', $event ? 'button' : 'default')"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class WebsiteNodeForm {
  // inputs
  public readonly i18n = input.required<WebsiteI18n>();
  public formData = model.required<WebsiteNodeFormModel>();
  /** the slug the node had before this edit; a change shows the «old links break» hint */
  public readonly originalSlug = input('');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly nodeForm = form(this.formData, (path) => validateVestTree(path, websiteNodeValidations as any));
  private readonly validationResult = vestErrors(this.nodeForm);

  constructor() {
    effect(() => this.valid.emit(this.nodeForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly labelLength = LABEL_LENGTH;
  /** the suite caps no url length; this only bounds what a field can hold */
  protected readonly urlLength = URL_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly type = computed(() => this.formData()?.type ?? 'menu');
  protected readonly label = computed(() => this.formData()?.label ?? '');
  protected readonly slug = computed(() => this.formData()?.slug ?? '');
  protected readonly url = computed(() => this.formData()?.url ?? '');
  protected readonly isButton = computed(() => this.formData()?.style === 'button');
  protected readonly slugChanged = computed(() => !!this.originalSlug() && this.slug() !== this.originalSlug());

  protected readonly labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected readonly slugErrors = computed(() => this.validationResult().getErrors('slug'));
  protected readonly urlErrors = computed(() => this.validationResult().getErrors('url'));

  protected readonly labelI18n = computed(() => ({
    name: 'label',
    label: this.i18n().label_label(),
    placeholder: this.i18n().label_placeholder(),
    helper: this.i18n().label_helper(),
  } as TextInputI18n));
  protected readonly slugI18n = computed(() => ({
    name: 'slug',
    label: this.i18n().slug_label(),
    placeholder: this.i18n().slug_placeholder(),
    helper: this.i18n().slug_helper(),
  } as TextInputI18n));
  protected readonly urlI18n = computed(() => ({
    name: 'url',
    label: this.i18n().url_label(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper(),
  } as TextInputI18n));
  protected readonly styleI18n = computed(() => ({
    name: 'style',
    label: this.i18n().style_label(),
    helper: this.i18n().style_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: keyof WebsiteNodeFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
