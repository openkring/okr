import { Component, computed, inject, input, signal } from '@angular/core';
import { CdkDragDrop, CdkDropList, CdkDropListGroup, CdkDrag, moveItemInArray } from '@angular/cdk/drag-drop';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonNote, IonSegment, IonSegmentButton, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { Field, FieldType, FormDefinitionModel } from '@bk2/shared-models';

import { FormDefinitionService } from '@bk2/forms-data-access';
import { FIELD_TYPE_DEFS, FieldTypeDef, FieldTypeLibrary, FormRenderer } from '@bk2/forms-ui';

import { FieldConfigModal } from './field-config.modal';

function newField(type: FieldType, order: number): Field {
  const base = {
    id: crypto.randomUUID(),
    key: `field_${order}`,
    label: FIELD_TYPE_DEFS.find((d: FieldTypeDef) => d.type === type)?.label ?? type,
    required: false,
    width: 'full' as const,
    order,
  };
  switch (type) {
    case 'dropdown': case 'radio': return { ...base, type, options: [] };
    case 'checkbox': return { ...base, type };
    case 'avatar': return { ...base, type, avatarType: 'person' };
    default: return { ...base, type } as Field;
  }
}

@Component({
  selector: 'bk-form-builder-editor',
  standalone: true,
  imports: [
    SvgIconPipe, Header, ChangeConfirmation,
    CdkDropList, CdkDropListGroup, CdkDrag, FieldTypeLibrary, FormRenderer,
    IonToolbar, IonButton, IonContent, IonItem, IonLabel, IonIcon, IonNote,
    IonSegment, IonSegmentButton,
  ],
  styles: [`
    .editor-layout { display: flex; min-height: 100%; }
    .library-panel { width: 260px; border-right: 1px solid var(--ion-border-color); display: flex; flex-direction: column; }
    .canvas-panel  { flex: 1; padding: 8px; }
    .canvas-drop   { min-height: 200px; border: 2px dashed var(--ion-color-light-shade); border-radius: 8px; padding: 8px; }
    .canvas-empty  { display: flex; align-items: center; justify-content: center; height: 120px; color: var(--ion-color-medium); }
    .field-row     { display: flex; align-items: center; background: var(--ion-item-background); border-radius: 6px; margin: 4px 0; cursor: grab; }
    .cdk-drag-preview    { opacity: 0.8; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drop-list-dragging .field-row:not(.cdk-drag-placeholder) { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
    .source-actions { display: flex; gap: 8px; padding: 8px 16px 0; }
    .source-view   { margin: 8px 16px; padding: 12px; background: var(--ion-color-light); border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre; overflow: auto; }
  `],
  template: `
    <bk-header [i18n]="{ title: 'Formular-Editor: ' + formData().name }" [isModal]="true" />
    @if (isDirty()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content>
      <div class="editor-layout" cdkDropListGroup>

        <!-- left: field-type library -->
        <div class="library-panel">
          <bk-field-type-library (fieldAdded)="addField($event)" />
        </div>

        <!-- right: canvas -->
        <div class="canvas-panel">
          <ion-toolbar>
            <ion-segment [value]="viewMode()" (ionChange)="viewMode.set($any($event).detail.value)">
              <ion-segment-button value="editor"><ion-label>Editor</ion-label></ion-segment-button>
              <ion-segment-button value="preview"><ion-label>Vorschau</ion-label></ion-segment-button>
              <ion-segment-button value="source"><ion-label>Quellcode</ion-label></ion-segment-button>
            </ion-segment>
          </ion-toolbar>

          @if (viewMode() === 'editor') {
            <div
              class="canvas-drop"
              cdkDropList
              [cdkDropListData]="fields()"
              (cdkDropListDropped)="onDrop($event)"
            >
              @if (fields().length === 0) {
                <div class="canvas-empty">Ziehe Felder aus der Bibliothek hierher.</div>
              }
              @for (field of fields(); track field.id) {
                <div class="field-row" cdkDrag [cdkDragData]="field">
                  <ion-item lines="none" style="flex:1">
                    <ion-icon src="{{ 'reorder-four' | svgIcon }}" slot="start" cdkDragHandle />
                    <ion-label>
                      <strong>{{ field.label }}</strong>
                      <p>{{ field.key }} · {{ field.type }} · {{ field.width }}</p>
                    </ion-label>
                    @if (field.required) {
                      <ion-icon src="{{ 'alert-circle' | svgIcon }}" slot="end" color="danger" />
                    }
                  </ion-item>
                  <ion-button fill="clear" (click)="editField(field)">
                    <ion-icon src="{{ 'settings' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                  <ion-button fill="clear" color="danger" (click)="removeField(field.id)">
                    <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                </div>
              }
            </div>
          } @else if (viewMode() === 'preview') {
            @if (fields().length === 0) {
              <div class="canvas-empty">Noch keine Felder zum Vorschauen.</div>
            } @else {
              <div style="padding: 8px 16px 24px;">
                <bk-form-renderer [definition]="previewDefinition()" [showSubmit]="false" />
              </div>
            }
          } @else {
            <div class="source-actions">
              <ion-button size="small" fill="outline" (click)="copySource()">
                <ion-icon src="{{ 'copy' | svgIcon }}" slot="start" />
                Kopieren
              </ion-button>
              <ion-button size="small" fill="outline" (click)="pasteSource()">
                Einfügen
              </ion-button>
            </div>
            @if (sourceMessage()) {
              <ion-note [color]="sourceError() ? 'danger' : 'success'" style="display:block; padding: 0 16px 4px;">{{ sourceMessage() }}</ion-note>
            }
            <pre class="source-view">{{ sourceCode() }}</pre>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class FormBuilderEditor {
  private readonly modalController = inject(ModalController);
  private readonly formDefinitionService = inject(FormDefinitionService);
  private readonly appStore = inject(AppStore);

  public readonly form = input.required<FormDefinitionModel>();

  protected formData = signal<FormDefinitionModel>({} as FormDefinitionModel);
  protected fields = signal<Field[]>([]);
  protected viewMode = signal<'editor' | 'preview' | 'source'>('editor');
  private readonly originalFieldsJson = signal('');

  protected readonly changeConfirmationI18n: ChangeConfirmationI18n = { cancel: 'Verwerfen', save: 'Speichern' };

  /** Live form definition for the preview, reflecting the current (unsaved) fields. */
  protected previewDefinition = computed<FormDefinitionModel>(() => ({
    ...this.formData(),
    fields: [...this.fields()].sort((a, b) => a.order - b.order),
  }));

  /** JSON source of the current form definition — editable externally via copy/paste. */
  protected sourceCode = computed(() => JSON.stringify(this.previewDefinition(), null, 2));

  /** Feedback for the source copy/paste actions ('' = none). */
  protected readonly sourceMessage = signal('');
  protected readonly sourceError = signal(false);

  /** True once the field set differs from what was loaded — drives the save/discard banner. */
  protected isDirty = computed(() => JSON.stringify(this.previewDefinition().fields) !== this.originalFieldsJson());

  public ngOnInit(): void {
    const clone = safeStructuredClone(this.form());
    this.formData.set(clone ?? this.form());
    const sortedFields = [...(clone?.fields ?? [])].sort((a, b) => a.order - b.order);
    this.fields.set(sortedFields);
    this.originalFieldsJson.set(JSON.stringify(sortedFields));
  }

  protected addField(type: FieldType): void {
    const field = newField(type, this.fields().length);
    this.fields.update(fs => [...fs, field]);
  }

  protected removeField(id: string): void {
    this.fields.update(fs => fs.filter(f => f.id !== id).map((f, i) => ({ ...f, order: i })));
  }

  protected async editField(field: Field): Promise<void> {
    const modal = await this.modalController.create({
      component: FieldConfigModal,
      componentProps: { field },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<Field>();
    if (role === 'confirm' && data) {
      this.fields.update(fs => fs.map(f => f.id === data.id ? data : f));
    }
  }

  protected onDrop(event: CdkDragDrop<Field[]>): void {
    const arr = [...this.fields()];
    if (event.previousContainer === event.container) {
      // reorder within the canvas
      moveItemInArray(arr, event.previousIndex, event.currentIndex);
    } else {
      // dropped from the palette — COPY a new field, never mutate the palette
      const def = event.item.data as FieldTypeDef;
      arr.splice(event.currentIndex, 0, newField(def.type, event.currentIndex));
    }
    this.fields.set(arr.map((f, i) => ({ ...f, order: i })));
  }

  public async save(): Promise<void> {
    const fd = { ...this.formData(), fields: this.fields() };
    await this.formDefinitionService.update(fd, this.appStore.currentUser());
    await this.modalController.dismiss(null, 'confirm');
  }

  /** Discard unsaved changes — revert to the originally loaded field set. */
  public cancel(): void {
    const clone = safeStructuredClone(this.form());
    const sortedFields = [...(clone?.fields ?? [])].sort((a, b) => a.order - b.order);
    this.fields.set(sortedFields);
    this.originalFieldsJson.set(JSON.stringify(sortedFields));
  }

  /** Copy the form-definition JSON to the clipboard for external editing. */
  protected async copySource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.sourceCode());
      this.sourceError.set(false);
      this.sourceMessage.set('In die Zwischenablage kopiert.');
    } catch {
      this.sourceError.set(true);
      this.sourceMessage.set('Kopieren fehlgeschlagen (Zwischenablage nicht verfügbar).');
    }
  }

  /** Parse externally-edited JSON from the clipboard and apply its fields to the builder. */
  protected async pasteSource(): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await navigator.clipboard.readText());
    } catch {
      this.sourceError.set(true);
      this.sourceMessage.set('Ungültiges JSON in der Zwischenablage.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { fields?: unknown }).fields)) {
      this.sourceError.set(true);
      this.sourceMessage.set('Ungültiges Format: erwartet ein Objekt mit einem "fields"-Array.');
      return;
    }
    const incoming = parsed as Partial<FormDefinitionModel> & { fields: Field[] };
    // Normalise externally-edited fields (ensure id + order) and apply.
    const fields = incoming.fields.map((f, i) => ({ ...f, id: f.id ?? crypto.randomUUID(), order: f.order ?? i }))
      .sort((a, b) => a.order - b.order);
    // Apply editable definition props, but keep identity/ownership from the loaded form.
    const current = this.formData();
    this.formData.set({
      ...current, ...incoming,
      bkey: current.bkey, tenants: current.tenants, formKey: current.formKey,
      version: current.version, createdAt: current.createdAt, createdBy: current.createdBy,
      fields,
    });
    this.fields.set(fields);
    this.sourceError.set(false);
    this.sourceMessage.set(`${fields.length} Felder aus der Zwischenablage übernommen. Zum Speichern bestätigen.`);
  }
}
