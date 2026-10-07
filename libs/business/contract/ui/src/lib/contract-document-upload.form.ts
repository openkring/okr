import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { ContractDocumentRef } from '@okr/shared-models';
import { ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import {
  CONTRACT_ACCEPT_ATTRIBUTE, CONTRACT_DOC_STATES, CONTRACT_DOCUMENT_ROLES, ContractDocumentUploadData,
  contractDocumentUploadValidations, contractFileMimeType, ContractI18n,
} from '@okr/business-contract-util';

/**
 * Adds one file to a contract dossier (spec 1.5 §7): the file, its kind (role), title, state and,
 * optionally, which existing file it replaces. The picked `File` is handed to the parent through
 * `fileSelected`; the form data only carries its name, size and resolved mime type for validation.
 */
@Component({
  selector: 'okr-contract-document-upload-form',
  standalone: true,
  imports: [TextInput, StringSelect, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    input[type=file] { padding: 8px 0; width: 100%; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label position="stacked">{{ i18n().file_pick_label() }}</ion-label>
                    <input type="file" name="file" [accept]="accept" [disabled]="isReadOnly()" (change)="onFileChange($event)" />
                  </ion-item>
                  <ion-item lines="none">
                    <ion-note>{{ i18n().file_pick_helper() }}</ion-note>
                  </ion-item>
                  <okr-error-note [errors]="fileNameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="titleLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="roleI18n()" [selectedString]="role()"
                    (selectedStringChange)="onFieldChange('role', $event)"
                    [stringList]="roles" [labels]="roleLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="roleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="docStateI18n()" [selectedString]="docState()"
                    (selectedStringChange)="onFieldChange('docState', $event)"
                    [stringList]="docStates" [labels]="docStateLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="docStateErrors()" />
                </ion-col>
                @if (documents().length > 0) {
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="priorI18n()" [selectedString]="priorVersionKey()"
                      (selectedStringChange)="onPriorChange($event)"
                      [stringList]="priorKeys()" [labels]="priorLabels()" [readOnly]="isReadOnly()" />
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
export class ContractDocumentUploadForm {
  protected readonly roles: string[] = CONTRACT_DOCUMENT_ROLES;
  protected readonly docStates: string[] = CONTRACT_DOC_STATES;
  protected readonly accept = CONTRACT_ACCEPT_ATTRIBUTE;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly titleLength = LONG_NAME_LENGTH;

  public readonly i18n = input.required<ContractI18n>();
  public formData = model.required<ContractDocumentUploadData>();
  /** the dossier's current files: the candidates for "replaces" */
  public readonly documents = input<ContractDocumentRef[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly fileSelected = output<File | undefined>();

  protected readonly uploadForm = form(this.formData, (path) =>
    validateVestTree(path, contractDocumentUploadValidations as any),
  );
  private readonly validationResult = vestErrors(this.uploadForm);
  protected fileNameErrors = computed(() => this.validationResult().getErrors('fileName'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected roleErrors = computed(() => this.validationResult().getErrors('role'));
  protected docStateErrors = computed(() => this.validationResult().getErrors('docState'));

  constructor() {
    effect(() => this.valid.emit(this.uploadForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly role = computed(() => this.formData()?.role ?? '');
  protected readonly docState = computed(() => this.formData()?.docState ?? '');
  protected readonly priorVersionKey = computed(() => this.formData()?.priorVersionKey ?? '');

  protected readonly titleI18n = computed(() => ({
    name: 'title', label: this.i18n().file_title_label(), placeholder: this.i18n().file_title_placeholder(),
    helper: this.i18n().file_title_helper(),
  } as TextInputI18n));
  protected readonly roleI18n = computed(() => ({ name: 'role', label: this.i18n().file_role_label() } as StringSelectI18n));
  protected readonly docStateI18n = computed(() => ({ name: 'docState', label: this.i18n().file_docState_label() } as StringSelectI18n));
  protected readonly priorI18n = computed(() => ({ name: 'priorVersionKey', label: this.i18n().file_prior_label() } as StringSelectI18n));

  protected readonly roleLabels = computed(() => {
    const i = this.i18n();
    return [i.role_contract(), i.role_annex(), i.role_amendment(), i.role_correspondence(), i.role_other()];
  });
  protected readonly docStateLabels = computed(() => {
    const i = this.i18n();
    return [i.docState_draft(), i.docState_redline(), i.docState_final(), i.docState_signed()];
  });
  protected readonly priorKeys = computed(() => ['', ...this.documents().map((d) => d.docKey)]);
  protected readonly priorLabels = computed(() => [this.i18n().file_prior_none(), ...this.documents().map((d) => d.title || d.docKey)]);

  protected onFieldChange(fieldName: 'title' | 'role' | 'docState', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** a replacement usually keeps the kind of the file it replaces */
  protected onPriorChange(docKey: string): void {
    const prior = this.documents().find((d) => d.docKey === docKey);
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, priorVersionKey: docKey ?? '', ...(prior ? { role: prior.role } : {}) }));
  }

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement | null)?.files?.[0];
    this.fileSelected.emit(file);
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm,
      fileName: file?.name ?? '',
      fileSize: file?.size ?? 0,
      mimeType: file ? contractFileMimeType(file.name, file.type) : '',
    }));
  }
}
