import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { MemberCatSection } from '@okr/shared-models';
import { EmptyList, OptionalCardHeader, Spinner } from '@okr/shared-ui';

import { MemberCatSectionStore } from './member-cat-section.store';
import { MemberBarChart } from './member-bar-chart';

@Component({
  selector: 'okr-member-cat-section',
  standalone: true,
  imports: [
    Spinner, EmptyList, OptionalCardHeader, MemberBarChart,
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
      <okr-spinner />
    } @else if(isEmpty()) {
      <okr-empty-list [message]="store.i18n.member_cat_empty()" />
    } @else {
      <ion-card>
        <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if(isBarChart()) {
            <okr-member-bar-chart
              [rows]="store.rows()"
              [maleLabel]="store.i18n.member_cat_male()"
              [femaleLabel]="store.i18n.member_cat_female()" />
          } @else {
          <ion-grid>
            <ion-row class="header-row">
              <ion-col>{{ store.i18n.member_cat_category() }}</ion-col>
              <ion-col class="num">{{ store.i18n.member_cat_male() }}</ion-col>
              <ion-col class="num">{{ store.i18n.member_cat_female() }}</ion-col>
              <ion-col class="num">{{ store.i18n.member_cat_total() }}</ion-col>
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
          }
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
  protected title = computed(() => this.store.appStore.replacePlaceholders(this.section()?.title ?? ''));
  protected subTitle = computed(() => this.store.appStore.replacePlaceholders(this.section()?.subTitle ?? ''));

  protected readonly isBarChart = computed(() => this.section()?.properties?.chartType === 'bar');

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
