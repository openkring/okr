import { Component, computed, input, output, signal } from '@angular/core';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { IonSearchbar } from '@ionic/angular';

import { FormI18n, PROPERTY_FIELD_TEMPLATES } from '@okr/forms-util';

import { FieldTypeCard, FieldTypeDef, FIELD_TYPE_DEFS } from './field-type-card';

@Component({
  selector: 'okr-field-type-library',
  standalone: true,
  imports: [IonSearchbar, FieldTypeCard, CdkDropList, CdkDrag],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .list { overflow-y: auto; flex: 1; }
    .group-title { padding: 12px 8px 4px; font-size: 12px; font-weight: 600; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-searchbar
      placeholder="Search field types…"
      [debounce]="200"
      (ionInput)="searchTerm.set($any($event).detail.value ?? '')"
    />
    <div class="list">
      <!-- «Eigene Angaben» (spec §4.4): only for mappings that store typed properties -->
      @if (propertyDefs().length > 0) {
        <div class="group-title">{{ i18n()?.property_group() }}</div>
        <div cdkDropList [cdkDropListData]="propertyDefs()" [cdkDropListSortingDisabled]="true" [cdkDropListEnterPredicate]="preventDrop">
          @for (def of propertyDefs(); track def.type) {
            <okr-field-type-card cdkDrag [cdkDragData]="def" [def]="def" (add)="fieldAdded.emit($event)" />
          }
        </div>
      }
      <!-- Palette: a connected drop list whose items COPY into the canvas. Sorting is
           disabled and nothing may be dropped back in, so cards stay put and are reusable. -->
      <div cdkDropList [cdkDropListData]="visibleDefs()" [cdkDropListSortingDisabled]="true" [cdkDropListEnterPredicate]="preventDrop">
        @for (def of visibleDefs(); track def.type) {
          <okr-field-type-card cdkDrag [cdkDragData]="def" [def]="def" (add)="fieldAdded.emit($event)" />
        }
      </div>
    </div>
  `,
})
export class FieldTypeLibrary {
  /** the «Eigene Angaben» group and the translated names of the basic types (e.g. «AHV-Nummer») */
  public readonly i18n = input<FormI18n>();
  /** true when the form's mapping has a `propertiesField`: lists the «Eigene Angaben» templates */
  public readonly showProperties = input(false);
  public readonly fieldAdded = output<FieldTypeDef>();

  // the palette never accepts drops — items only copy out of it
  protected readonly preventDrop = (): boolean => false;

  protected readonly searchTerm = signal('');
  protected readonly visibleDefs = computed(() => {
    const i18n = this.i18n();
    const defs = FIELD_TYPE_DEFS.map(d => (i18n ? {
      ...d,
      label: d.labelKey ? i18n[d.labelKey]() : d.label,
      description: d.descriptionKey ? i18n[d.descriptionKey]() : d.description,
    } : d));
    return this.filter(defs);
  });

  protected readonly propertyDefs = computed<FieldTypeDef[]>(() => {
    const i18n = this.i18n();
    if (!this.showProperties() || !i18n) return [];
    const defs = PROPERTY_FIELD_TEMPLATES.map(t => ({
      type: t.type, icon: t.icon, label: i18n[t.labelKey](), description: i18n.property_template_desc(), asProperty: true,
    }));
    return this.filter(defs);
  });

  private filter(defs: FieldTypeDef[]): FieldTypeDef[] {
    const term = this.searchTerm().toLowerCase();
    if (!term) return defs;
    return defs.filter(d => d.label.toLowerCase().includes(term) || d.description.toLowerCase().includes(term));
  }
}
