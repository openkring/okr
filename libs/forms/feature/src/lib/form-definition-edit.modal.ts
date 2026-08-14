import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonList, IonNote, IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonTextarea, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { Header } from '@okr/shared-ui';
import { FormDefinitionModel, SubmissionTarget } from '@okr/shared-models';
import { safeStructuredClone } from '@okr/shared-util-core';
import { FormDefinitionService } from '@okr/forms-data-access';
import { FORM_MAPPINGS, getPrefillFields, FORM_I18N_KEYS, FormI18n } from '@okr/forms-util';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';

@Component({
  selector: 'okr-form-definition-edit-modal',
  standalone: true,
  imports: [
    FormsModule, Header,
    IonContent, IonList, IonItem, IonLabel,
    IonInput, IonTextarea, IonRadioGroup, IonRadio,
    IonSelect, IonSelectOption, IonButton, IonNote,
  ],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-list lines="full">

        <!-- Name -->
        <ion-item>
          <ion-label position="stacked">{{ i18n.def_name() }}</ion-label>
          <ion-input [ngModel]="formData().name" (ngModelChange)="patch({ name: $event })" [placeholder]="i18n.def_name_placeholder()" />
        </ion-item>

        <!-- Description -->
        <ion-item>
          <ion-label position="stacked">{{ i18n.description() }}</ion-label>
          <ion-textarea [ngModel]="formData().description" (ngModelChange)="patch({ description: $event })" rows="3" />
        </ion-item>

        <!-- form key (read-only after creation) -->
        @if (mode() === 'edit') {
          <ion-item>
            <ion-label position="stacked">{{ i18n.form_key() }}</ion-label>
            <ion-input [value]="formData().formKey" [readonly]="true" />
          </ion-item>
        }

        <!-- Target type -->
        <ion-item>
          <ion-label position="stacked">{{ i18n.def_target_kind() }}</ion-label>
          <ion-radio-group [ngModel]="targetKind()" (ngModelChange)="setTargetKind($event)">
            <ion-item>
              <ion-radio value="collection" />&nbsp;{{ i18n.target_collection() }}
            </ion-item>
            <ion-item>
              <ion-radio value="url" />&nbsp;{{ i18n.def_target_url_short() }}
            </ion-item>
          </ion-radio-group>
        </ion-item>

        <!-- Collection picker -->
        @if (targetKind() === 'collection') {
          <ion-item>
            <ion-label position="stacked">{{ i18n.def_collection() }}</ion-label>
            <ion-select [ngModel]="collectionMappingKey()" (ngModelChange)="setMappingKey($event)" [placeholder]="i18n.def_select_placeholder()">
              @for (m of formMappings; track m.mappingKey) {
                <ion-select-option [value]="m.mappingKey">{{ m.label }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
        }

        <!-- URL input -->
        @if (targetKind() === 'url') {
          <ion-item>
            <ion-label position="stacked">{{ i18n.url_label() }}</ion-label>
            <ion-input [ngModel]="urlTarget()" (ngModelChange)="setUrl($event)" placeholder="https://…" type="url" />
          </ion-item>
        }

        <!-- PDF template (optional) -->
        <ion-item>
          <ion-label position="stacked">{{ i18n.def_pdf_template() }}</ion-label>
          <ion-input [ngModel]="formData().pdfTemplateId" (ngModelChange)="patch({ pdfTemplateId: $event })" [placeholder]="i18n.def_pdf_template_ph()" />
        </ion-item>

        <!-- Field preview (prefilled from the selected collection) -->
        @if (formData().fields.length > 0) {
          <ion-item lines="none">
            <ion-label position="stacked">{{ fieldsLabel() }}</ion-label>
          </ion-item>
          @for (field of formData().fields; track field.id) {
            <ion-item>
              <ion-label>
                {{ field.label }}
                @if (field.required) { <span style="color: var(--ion-color-danger);">*</span> }
                <ion-note slot="end">{{ field.type }}</ion-note>
              </ion-label>
            </ion-item>
          }
        }

      </ion-list>

      <ion-button expand="block" [disabled]="!isValid()" (click)="save()" style="margin: 16px;">
        {{ i18n.save() }}
      </ion-button>
    </ion-content>
  `,
})
export class FormDefinitionEditModal {
  private readonly modalController = inject(ModalController);
  private readonly formDefinitionService = inject(FormDefinitionService);
  private readonly appStore = inject(AppStore);

  public readonly form = input.required<FormDefinitionModel>();
  public readonly mode = input.required<'create' | 'edit'>();

  protected readonly formMappings = FORM_MAPPINGS;
  protected formData = linkedSignal(() => safeStructuredClone(this.form()) ?? this.form());

  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(FORM_I18N_KEYS) as FormI18n;

  protected readonly title = computed(() =>
    this.mode() === 'create' ? this.i18n.def_create_title() : this.i18n.def_edit_title()
  );

  protected readonly fieldsLabel = computed(() =>
    fill(this.i18n.def_fields(), { count: this.formData().fields.length }));

  protected readonly targetKind = computed(() => this.formData().target.kind);

  protected readonly collectionMappingKey = computed(() => {
    const target = this.formData().target;
    return target.kind === 'collection' ? target.mappingKey : '';
  });

  protected readonly urlTarget = computed(() => {
    const target = this.formData().target;
    return target.kind === 'url' ? target.url : '';
  });

  protected readonly isValid = computed(() => {
    const fd = this.formData();
    if (!fd.name.trim()) return false;
    if (fd.target.kind === 'collection' && !fd.target.mappingKey) return false;
    if (fd.target.kind === 'url' && !fd.target.url?.trim()) return false;
    return true;
  });

  /** Emit a new formData object so computeds (e.g. isValid) react to plain-text edits. */
  protected patch(partial: Partial<FormDefinitionModel>): void {
    this.formData.update(fd => ({ ...fd, ...partial }));
  }

  protected setTargetKind(kind: 'collection' | 'url'): void {
    const fd = this.formData();
    // Ionic's radio-group emits ngModelChange on init; ignore the echo so it
    // doesn't wipe the pre-selected mapping (and disable Save).
    if (fd.target.kind === kind) return;
    const target: SubmissionTarget = kind === 'collection'
      ? { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' }
      : { kind: 'url', url: '' };
    this.formData.set({ ...fd, target });
  }

  protected setMappingKey(mappingKey: string): void {
    const mapping = FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
    if (!mapping) return;
    const fd = this.formData();
    // In create mode the field list is a read-only preview, so swap it to the
    // selected collection's template. In edit mode never clobber saved fields.
    const fields = this.mode() === 'create'
      ? getPrefillFields(mappingKey)
      : fd.fields;
    this.formData.set({
      ...fd,
      fields,
      target: { kind: 'collection', mappingKey, modelType: mapping.modelType, collectionName: mapping.collectionName },
    });
  }

  protected setUrl(url: string): void {
    const fd = this.formData();
    this.formData.set({ ...fd, target: { kind: 'url', url } });
  }

  public async save(): Promise<void> {
    const fd = this.formData();
    const currentUser = this.appStore.currentUser();
    if (this.mode() === 'create') {
      fd.tenants = [this.appStore.tenantId()];
      await this.formDefinitionService.create(fd, currentUser);
    } else {
      await this.formDefinitionService.update(fd, currentUser);
    }
    await this.modalController.dismiss(null, 'confirm');
  }
}
