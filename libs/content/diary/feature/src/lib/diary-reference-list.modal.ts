import { Component, computed, inject, input, signal } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonBadge, IonContent, IonIcon, IonItem, IonLabel,
  IonList, IonNote, IonSegment, IonSegmentButton, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Header } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import {
  DIARY_I18N_KEYS, DiaryI18n, DiaryReference, DiaryReferenceFilter, DiaryReferenceKind,
  filterDiaryReferences,
} from '@okr/content-diary-util';

/** What the modal hands back so the store can act on it. `undefined` means the user closed it. */
export interface DiaryReferenceListResult {
  action: 'edit' | 'diaries';
  reference: DiaryReference;
}

/**
 * The places (or the people) the diary archive mentions, resolved and unresolved in one list.
 *
 * Presentational on purpose: it filters and picks, it never writes. Every action leaves through
 * `dismissOverlay` and the AOC store performs it, then re-opens this list — which is also why it
 * must not inject that store (it would close the import cycle the store↔modal contract forbids).
 */
@Component({
  selector: 'okr-diary-reference-list-modal',
  standalone: true,
  imports: [
    Header, EmptyList, SvgIconPipe,
    IonContent, IonToolbar, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem,
    IonIcon, IonNote, IonBadge,
  ],
  styles: [`
    .item { --min-height: 44px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <okr-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="searchTerm.set($event)"
      [isSearchable]="true"
      [i18n]="{ title: title(), placeholder: i18n.reference_search() }"
      [isModal]="true"
    />
    <ion-toolbar color="light">
      <ion-segment [value]="filter()" (ionChange)="onFilterChange($event)">
        <ion-segment-button value="all">
          <ion-label>{{ i18n.reference_filter_all() }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="unresolved">
          <ion-label>{{ i18n.reference_filter_unresolved() }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="resolved">
          <ion-label>{{ i18n.reference_filter_resolved() }}</ion-label>
        </ion-segment-button>
      </ion-segment>
    </ion-toolbar>

    <ion-content>
      @if(visibleReferences().length === 0) {
        <okr-empty-list [message]="i18n.reference_empty()" />
      } @else {
        <ion-list lines="inset">
          @for(reference of visibleReferences(); track reference.id) {
            <ion-item class="item" (click)="showActions(reference)" button>
              <!-- the icon IS the resolved/unresolved state: a matched record or an open question -->
              <ion-icon
                slot="start"
                [color]="reference.resolved ? 'success' : 'warning'"
                src="{{ (reference.resolved ? 'checkmark' : 'help') | svgIcon }}" />
              <ion-label>
                <h3>{{ reference.label }}</h3>
                @if(!reference.resolved) {
                  <p>{{ i18n.reference_unresolved() }}</p>
                }
              </ion-label>
              <ion-badge slot="end" color="medium">{{ reference.usages.length }}</ion-badge>
            </ion-item>
          }
        </ion-list>
        <ion-note class="ion-margin">{{ visibleReferences().length }} / {{ references().length }}</ion-note>
      }
    </ion-content>
  `,
})
export class DiaryReferenceListModal {
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  protected readonly i18n = inject(I18nService).translateAll(DIARY_I18N_KEYS) as DiaryI18n;

  // inputs
  public kind = input.required<DiaryReferenceKind>();
  public references = input.required<DiaryReference[]>();
  /** imgix base url — the ActionSheet buttons need absolute icon urls, not pipe output */
  public iconBaseUrl = input.required<string>();

  protected readonly searchTerm = signal('');
  protected readonly filter = signal<DiaryReferenceFilter>('unresolved');

  protected readonly title = computed(() =>
    this.kind() === 'location' ? this.i18n.locations_title() : this.i18n.persons_title());
  protected readonly visibleReferences = computed(() =>
    filterDiaryReferences(this.references(), this.searchTerm(), this.filter()));

  protected onFilterChange(event: Event): void {
    this.filter.set((event as CustomEvent).detail.value as DiaryReferenceFilter);
  }

  /**
   * `edit` is offered only for a resolved reference: an unresolved one has no record behind it
   * to open — it is fixed from the diary list, where the label can be turned into a record or
   * pointed at an existing one.
   */
  protected async showActions(reference: DiaryReference): Promise<void> {
    const base = this.iconBaseUrl();
    const options: ActionSheetOptions = createActionSheetOptions(reference.label);
    if (reference.resolved) {
      const label = this.kind() === 'location' ? this.i18n.location_edit() : this.i18n.person_edit();
      options.buttons.push(createActionSheetButton('reference.edit', label, base, 'edit'));
    }
    options.buttons.push(createActionSheetButton('show.diaries', this.i18n.show_diaries(), base, 'document'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    if (data.action === 'reference.edit') {
      await dismissOverlay(this.modalController, { action: 'edit', reference } satisfies DiaryReferenceListResult, 'confirm');
    } else if (data.action === 'show.diaries') {
      await dismissOverlay(this.modalController, { action: 'diaries', reference } satisfies DiaryReferenceListResult, 'confirm');
    }
  }
}
