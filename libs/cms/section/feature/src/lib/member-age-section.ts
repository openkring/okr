import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { MemberAgeSection } from '@bk2/shared-models';
import { EmptyList, Spinner } from '@bk2/shared-ui';

import { MemberAgeSectionStore } from './member-age-section.store';

@Component({
  selector: 'bk-member-age-section',
  standalone: true,
  imports: [Spinner, EmptyList, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  providers: [MemberAgeSectionStore],
  styles: [`
    .header-row { font-weight: 600; }
    .total-row  { font-weight: 700; }
    .num        { text-align: right; }
  `],
  template: `
    @if(store.isLoading()) {
      <bk-spinner />
    } @else if(isEmpty()) {
      <bk-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row class="header-row">
              <ion-col>{{ store.i18n.ageGroup() }}</ion-col>
              <ion-col class="num">{{ store.i18n.male() }}</ion-col>
              <ion-col class="num">{{ store.i18n.female() }}</ion-col>
              <ion-col class="num">{{ store.i18n.total() }}</ion-col>
            </ion-row>
            @for(row of store.rows(); track row.label; let last = $last) {
              <ion-row [class.total-row]="last">
                <ion-col>{{ row.label }}</ion-col>
                <ion-col class="num">{{ row.male }}</ion-col>
                <ion-col class="num">{{ row.female }}</ion-col>
                <ion-col class="num">{{ row.total }}</ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }
  `
})
export class MemberAgeSectionComponent {
  protected readonly store = inject(MemberAgeSectionStore);

  public section = input<MemberAgeSection>();
  public editMode = input<boolean>(false);

  protected readonly isEmpty = computed(() => {
    const rows = this.store.rows();
    return (rows[rows.length - 1]?.total ?? 0) === 0;
  });

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }
}
