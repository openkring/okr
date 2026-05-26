import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { MemberCatSection } from '@bk2/shared-models';
import { EmptyList, OptionalCardHeader, Spinner } from '@bk2/shared-ui';

import { MemberCatSectionStore } from './member-cat-section.store';

@Component({
  selector: 'bk-member-cat-section',
  standalone: true,
  imports: [
    Spinner, EmptyList, OptionalCardHeader,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol
  ],
  providers: [MemberCatSectionStore],
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
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-grid>
            <ion-row class="header-row">
              <ion-col>{{ store.i18n.category() }}</ion-col>
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
export class MemberCatSectionComponent {
  protected readonly store = inject(MemberCatSectionStore);

  // inputs
  public section = input<MemberCatSection>();
  public editMode = input<boolean>(false);

  // derived
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

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
