import { Component, inject, input, signal } from '@angular/core';
import { CdkDragDrop, CdkDropList, CdkDrag, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { Header } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { Field, FieldType, FormDefinitionModel } from '@bk2/shared-models';
import { FormDefinitionService } from '@bk2/forms-data-access';
import { FIELD_TYPE_DEFS, FieldTypeDef, FieldTypeLibrary } from '@bk2/forms-ui';
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
    SvgIconPipe, Header, FieldTypeLibrary,
    CdkDropList, CdkDrag,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonList, IonItem, IonLabel, IonIcon,
  ],
  styles: [`
    .editor-layout { display: flex; height: 100%; overflow: hidden; }
    .library-panel { width: 260px; border-right: 1px solid var(--ion-border-color); overflow: hidden; display: flex; flex-direction: column; }
    .canvas-panel  { flex: 1; overflow-y: auto; padding: 8px; }
    .canvas-drop   { min-height: 200px; border: 2px dashed var(--ion-color-light-shade); border-radius: 8px; padding: 8px; }
    .canvas-empty  { display: flex; align-items: center; justify-content: center; height: 120px; color: var(--ion-color-medium); }
    .field-row     { display: flex; align-items: center; background: var(--ion-item-background); border-radius: 6px; margin: 4px 0; cursor: grab; }
    .cdk-drag-preview    { opacity: 0.8; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drop-list-dragging .field-row:not(.cdk-drag-placeholder) { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
  `],
  template: `
    <bk-header [i18n]="{ title: 'Formular-Editor: ' + formData().name }" [isModal]="true" />
    <ion-content>
      <div class="editor-layout">

        <!-- left: field-type library -->
        <div class="library-panel">
          <bk-field-type-library (fieldAdded)="addField($event)" />
        </div>

        <!-- right: canvas -->
        <div class="canvas-panel">
          <ion-toolbar>
            <ion-title>Felder</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="save()" color="primary">
                <ion-icon src="{{ 'save' | svgIcon }}" slot="start" />
                Speichern
              </ion-button>
            </ion-buttons>
          </ion-toolbar>

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
                  <ion-icon src="{{ 'reorder-three' | svgIcon }}" slot="start" cdkDragHandle />
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

  public ngOnInit(): void {
    const clone = safeStructuredClone(this.form());
    this.formData.set(clone ?? this.form());
    this.fields.set([...(clone?.fields ?? [])].sort((a, b) => a.order - b.order));
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
      moveItemInArray(arr, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, arr, event.previousIndex, event.currentIndex);
    }
    this.fields.set(arr.map((f, i) => ({ ...f, order: i })));
  }

  public async save(): Promise<void> {
    const fd = { ...this.formData(), fields: this.fields() };
    await this.formDefinitionService.update(fd, this.appStore.currentUser());
    await this.modalController.dismiss(null, 'confirm');
  }
}
