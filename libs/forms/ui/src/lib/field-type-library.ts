import { Component, computed, output, signal } from '@angular/core';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { IonSearchbar } from '@ionic/angular/standalone';
import { FieldType } from '@bk2/shared-models';
import { FieldTypeCard, FieldTypeDef, FIELD_TYPE_DEFS } from './field-type-card';

@Component({
  selector: 'bk-field-type-library',
  standalone: true,
  imports: [IonSearchbar, FieldTypeCard, CdkDropList, CdkDrag],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .list { overflow-y: auto; flex: 1; }
  `],
  template: `
    <ion-searchbar
      placeholder="Search field types…"
      [debounce]="200"
      (ionInput)="searchTerm.set($any($event).detail.value ?? '')"
    />
    <!-- Palette: a connected drop list whose items COPY into the canvas. Sorting is
         disabled and nothing may be dropped back in, so cards stay put and are reusable. -->
    <div class="list" cdkDropList [cdkDropListData]="visibleDefs()" [cdkDropListSortingDisabled]="true" [cdkDropListEnterPredicate]="preventDrop">
      @for (def of visibleDefs(); track def.type) {
        <bk-field-type-card cdkDrag [cdkDragData]="def" [def]="def" (add)="fieldAdded.emit($event.type)" />
      }
    </div>
  `,
})
export class FieldTypeLibrary {
  public readonly fieldAdded = output<FieldType>();

  // the palette never accepts drops — items only copy out of it
  protected readonly preventDrop = (): boolean => false;

  protected readonly searchTerm = signal('');
  protected readonly visibleDefs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return FIELD_TYPE_DEFS;
    return FIELD_TYPE_DEFS.filter(d =>
      d.label.toLowerCase().includes(term) || d.description.toLowerCase().includes(term)
    );
  });
}
