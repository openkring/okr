import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { FormDefinitionModel, SubmissionTarget } from '@okr/shared-models';
import {
  ErrorNote, NotesInput, NotesInputI18n, RadioGroup, RadioGroupI18n,
  StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean, fill } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import { FORM_MAPPINGS, FormI18n, formDefinitionValidations, getPrefillFields } from '@okr/forms-util';

const TARGET_KINDS: SubmissionTarget['kind'][] = ['collection', 'url'];

/** Settings of a form definition: name, description, key, submission target and PDF template. The parent modal drives saving. */
@Component({
  selector: 'okr-form-definition-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, NotesInput, RadioGroup, StringSelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonList, IonItem, IonLabel, IonNote,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                @if (mode() === 'edit') {
                  <ion-col size="12" size-md="6">
                    <!-- the form key is generated on creation and never changes -->
                    <okr-text-input [i18n]="formKeyI18n()" [value]="formKey()" [readOnly]="true" />
                  </ion-col>
                }
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
                    [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-radio-group [i18n]="targetKindI18n()" [stringList]="targetKinds" [labels]="targetKindLabels()"
                    [selectedString]="targetKind()" (selectedStringChange)="setTargetKind($event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  @if (targetKind() === 'collection') {
                    <okr-string-select [i18n]="collectionI18n()" [stringList]="mappingKeys" [labels]="mappingLabels"
                      [selectedString]="collectionMappingKey()" (selectedStringChange)="setMappingKey($event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="mappingKeyErrors()" />
                  } @else {
                    <okr-text-input [i18n]="urlI18n()" [value]="urlTarget()" (valueChange)="setUrl($event)"
                      inputMode="url" [maxLength]="urlLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="urlErrors()" />
                  }
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="pdfTemplateI18n()" [value]="pdfTemplateId()" (valueChange)="onFieldChange('pdfTemplateId', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- read-only preview of the fields (prefilled from the selected collection, edited in the form builder) -->
        @if (fields().length > 0) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-list lines="full">
                <ion-item lines="none">
                  <ion-label><ion-note>{{ fieldsLabel() }}</ion-note></ion-label>
                </ion-item>
                @for (field of fields(); track field.id) {
                  <ion-item>
                    <ion-label>
                      {{ field.label }}
                      @if (field.required) { <span style="color: var(--ion-color-danger);">*</span> }
                    </ion-label>
                    <ion-note slot="end">{{ field.type }}</ion-note>
                  </ion-item>
                }
              </ion-list>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class FormDefinitionForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  protected readonly targetKinds = TARGET_KINDS;
  protected readonly mappingKeys = FORM_MAPPINGS.map(m => m.mappingKey);
  protected readonly mappingLabels = FORM_MAPPINGS.map(m => m.label);

  // inputs
  public readonly i18n = input.required<FormI18n>();
  public formData = model.required<FormDefinitionModel>();
  /** create: picking a collection replaces the field preview with its template; edit: saved fields are kept */
  public readonly mode = input<'create' | 'edit'>('edit');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly formDefinitionForm = form(this.formData, (path) => validateVestTree(path, formDefinitionValidations as any));

  // per-field Vest errors for the notes under each field
  private readonly validationResult = vestErrors(this.formDefinitionForm);
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected descriptionErrors = computed(() => this.validationResult().getErrors('description'));
  protected mappingKeyErrors = computed(() => this.validationResult().getErrors('target.mappingKey'));
  protected urlErrors = computed(() => this.validationResult().getErrors('target.url'));

  constructor() {
    effect(() => this.valid.emit(this.formDefinitionForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData().name ?? '');
  protected readonly description = computed(() => this.formData().description ?? '');
  protected readonly formKey = computed(() => this.formData().formKey ?? '');
  protected readonly pdfTemplateId = computed(() => this.formData().pdfTemplateId ?? '');
  protected readonly fields = computed(() => this.formData().fields ?? []);
  protected readonly targetKind = computed(() => this.formData().target.kind);
  protected readonly collectionMappingKey = computed(() => {
    const target = this.formData().target;
    return target.kind === 'collection' ? target.mappingKey : '';
  });
  protected readonly urlTarget = computed(() => {
    const target = this.formData().target;
    return target.kind === 'url' ? target.url : '';
  });
  protected readonly fieldsLabel = computed(() => fill(this.i18n().def_fields(), { count: this.fields().length }));

  // i18n for the shared/ui primitives
  protected readonly nameI18n = computed<TextInputI18n>(() => ({
    name: 'name', label: this.i18n().def_name(), placeholder: this.i18n().def_name_placeholder(), helper: '',
  }));
  protected readonly formKeyI18n = computed<TextInputI18n>(() => ({
    name: 'formKey', label: this.i18n().form_key(), placeholder: '', helper: '',
  }));
  protected readonly descriptionI18n = computed<NotesInputI18n>(() => ({
    name: 'description', label: this.i18n().description(), placeholder: '',
  }));
  protected readonly targetKindI18n = computed<RadioGroupI18n>(() => ({
    name: 'targetKind', label: this.i18n().def_target_kind(),
  }));
  protected readonly targetKindLabels = computed(() => [this.i18n().target_collection(), this.i18n().def_target_url_short()]);
  protected readonly collectionI18n = computed<StringSelectI18n>(() => ({
    name: 'mappingKey', label: this.i18n().def_collection(),
  }));
  protected readonly urlI18n = computed<TextInputI18n>(() => ({
    name: 'url', label: this.i18n().url_label(), placeholder: 'https://…', helper: '',
  }));
  protected readonly pdfTemplateI18n = computed<TextInputI18n>(() => ({
    name: 'pdfTemplateId', label: this.i18n().def_pdf_template(), placeholder: this.i18n().def_pdf_template_ph(), helper: '',
  }));

  protected onFieldChange(fieldName: 'name' | 'description' | 'pdfTemplateId', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected setTargetKind(kind: string): void {
    const fd = this.formData();
    // ignore an echo of the current kind so it doesn't wipe the selected mapping
    if (fd.target.kind === kind || (kind !== 'collection' && kind !== 'url')) return;
    const target: SubmissionTarget = kind === 'collection'
      ? { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' }
      : { kind: 'url', url: '' };
    this.dirty.emit(true);
    this.formData.set({ ...fd, target });
  }

  protected setMappingKey(mappingKey: string): void {
    const mapping = FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
    if (!mapping) return;
    const fd = this.formData();
    if (fd.target.kind === 'collection' && fd.target.mappingKey === mappingKey) return;
    // In create mode the field list is a read-only preview, so swap it to the
    // selected collection's template. In edit mode never clobber saved fields.
    const fields = this.mode() === 'create' ? getPrefillFields(mappingKey) : fd.fields;
    this.dirty.emit(true);
    this.formData.set({
      ...fd,
      fields,
      target: { kind: 'collection', mappingKey, modelType: mapping.modelType, collectionName: mapping.collectionName },
    });
  }

  protected setUrl(url: string): void {
    this.dirty.emit(true);
    this.formData.update((fd) => ({ ...fd, target: { kind: 'url', url } }));
  }
}
