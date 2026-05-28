import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonContent, IonInput, IonItem, IonLabel,
  IonList, IonNote, IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonTextarea,
  ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { Header } from '@bk2/shared-ui';
import { FormDefinitionModel, SubmissionTarget } from '@bk2/shared-models';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { FormDefinitionService } from '@bk2/forms-data-access';
import { FORM_MAPPINGS } from '@bk2/forms-util';

@Component({
  selector: 'bk-form-definition-edit-modal',
  standalone: true,
  imports: [
    FormsModule, Header,
    IonContent, IonList, IonItem, IonLabel, IonNote,
    IonInput, IonTextarea, IonRadioGroup, IonRadio,
    IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <bk-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-list lines="full">

        <!-- Name -->
        <ion-item>
          <ion-label position="stacked">Name *</ion-label>
          <ion-input [(ngModel)]="formData().name" placeholder="Kontaktformular" />
        </ion-item>

        <!-- Description -->
        <ion-item>
          <ion-label position="stacked">Beschreibung</ion-label>
          <ion-textarea [(ngModel)]="formData().description" rows="3" />
        </ion-item>

        <!-- form key (read-only after creation) -->
        @if (mode() === 'edit') {
          <ion-item>
            <ion-label position="stacked">Form-Key (unveränderlich)</ion-label>
            <ion-input [value]="formData().formKey" [readonly]="true" />
          </ion-item>
        }

        <!-- Target type -->
        <ion-item>
          <ion-label position="stacked">Einreichungen speichern in</ion-label>
          <ion-radio-group [ngModel]="targetKind()" (ngModelChange)="setTargetKind($event)">
            <ion-item>
              <ion-radio value="collection" />&nbsp;Firestore-Sammlung (empfohlen)
            </ion-item>
            <ion-item>
              <ion-radio value="url" />&nbsp;Externe URL
            </ion-item>
          </ion-radio-group>
        </ion-item>

        <!-- Collection picker -->
        @if (targetKind() === 'collection') {
          <ion-item>
            <ion-label position="stacked">Sammlung</ion-label>
            <ion-select [ngModel]="collectionMappingKey()" (ngModelChange)="setMappingKey($event)" placeholder="Auswählen…">
              @for (m of formMappings; track m.mappingKey) {
                <ion-select-option [value]="m.mappingKey">{{ m.label }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
        }

        <!-- URL input -->
        @if (targetKind() === 'url') {
          <ion-item>
            <ion-label position="stacked">Ziel-URL</ion-label>
            <ion-input [ngModel]="urlTarget()" (ngModelChange)="setUrl($event)" placeholder="https://…" type="url" />
          </ion-item>
        }
      </ion-list>

      <ion-button expand="block" [disabled]="!isValid()" (click)="save()" style="margin: 16px;">
        Speichern
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

  protected readonly title = computed(() =>
    this.mode() === 'create' ? 'Neues Formular' : 'Formular bearbeiten'
  );

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

  protected setTargetKind(kind: 'collection' | 'url'): void {
    const fd = this.formData();
    const target: SubmissionTarget = kind === 'collection'
      ? { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' }
      : { kind: 'url', url: '' };
    this.formData.set({ ...fd, target });
  }

  protected setMappingKey(mappingKey: string): void {
    const mapping = FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
    if (!mapping) return;
    const fd = this.formData();
    this.formData.set({
      ...fd,
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
