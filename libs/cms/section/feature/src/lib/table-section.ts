import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular';

import { TableView } from '@okr/cms-section-ui';
import { TableSection } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { SectionStore } from './section.store';

/**
 * A table of HTML cells (`okr-table-view`), with an optional header row. The title stands above the table, as its first row, as a
 * legend below it, or not at all (`grid.showTitleAs`). In a narrow container the table stacks or scrolls (`properties.responsive`).
 */
@Component({
  selector: 'okr-table-section',
  standalone: true,
  imports: [Spinner, OptionalCardHeader, TableView, IonCard, IonCardContent, IonLabel, IonItem],
  providers: [SectionStore],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
    ion-label { margin-top: 0px; user-select: text; -webkit-user-select: text; }
  `],
  template: `
    @if (section(); as section) {
      <ion-card>
        @if (showTitleAs() === 'title') {
          <okr-optional-card-header [intro]="section.intro" [introPosition]="section.introPosition" [title]="section.title" [subTitle]="section.subTitle" />
        }
        <ion-card-content>
          @if (isEmpty()) {
            <ion-item lines="none"><ion-label>{{ store.i18n.table_empty() }}</ion-label></ion-item>
          } @else {
            <okr-table-view [config]="section.properties" [title]="section.title" />
          }
          @if (section.title && showTitleAs() === 'legend') {
            <ion-item lines="none" class="legend"><ion-label><i>{{ section.title }}</i></ion-label></ion-item>
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `,
})
export class TableSectionComponent {
  protected readonly store = inject(SectionStore);

  // inputs
  public readonly section = input<TableSection>();

  protected readonly showTitleAs = computed(() => this.section()?.properties?.grid?.showTitleAs ?? 'title');
  protected readonly isEmpty = computed(() => {
    const data = this.section()?.properties?.data;
    return (data?.header?.length ?? 0) === 0 && (data?.body?.length ?? 0) === 0;
  });
}
