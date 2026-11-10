import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { PageModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { WEBSITE_I18N_KEYS, WebsiteI18n } from '@okr/cms-website-util';

/**
 * Picker for «Seite hinzufügen → Bestehende Seite»: the tenant's live pages that are not yet in the
 * tree (the store filters them). Dismisses with the chosen page key and role 'confirm'.
 */
@Component({
  selector: 'okr-website-page-picker-modal',
  standalone: true,
  imports: [Header, EmptyList, SvgIconPipe, IonContent, IonList, IonItem, IonLabel, IonIcon],
  template: `
    <okr-header [i18n]="{ title: i18n.picker_title() }" [isModal]="true"
      [isSearchable]="true" [searchTerm]="searchTerm()" (searchTermChange)="searchTerm.set($event)" />
    <ion-content>
      @if (filtered().length === 0) {
        <okr-empty-list [message]="i18n.picker_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (page of filtered(); track page.okey) {
            <ion-item button [detail]="false" (click)="select(page)">
              <ion-icon slot="start" src="{{ 'page' | svgIcon }}" />
              <ion-label>
                <h2>{{ page.name }}</h2>
                @if (page.title && page.title !== page.name) {
                  <p>{{ page.title }}</p>
                }
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class WebsitePagePickerModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(WEBSITE_I18N_KEYS) as WebsiteI18n;

  // inputs
  public readonly pages = input.required<PageModel[]>();

  protected readonly searchTerm = signal('');
  protected readonly filtered = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.pages();
    return this.pages().filter((p) => (p.name ?? '').toLowerCase().includes(term) || (p.title ?? '').toLowerCase().includes(term));
  });

  protected async select(page: PageModel): Promise<void> {
    await dismissOverlay(this.modalController, page.okey, 'confirm');
  }
}
