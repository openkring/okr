import { Component, computed, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonContent, IonIcon, IonItem, IonLabel, IonList,
  IonNote, ModalController,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Header } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import {
  DIARY_I18N_KEYS, DiaryI18n, DiaryReference, DiaryUsage, formatDiaryDate,
} from '@okr/content-diary-util';

/** What the modal hands back. `undefined` means the user closed it without choosing. */
export interface DiaryUsageListResult {
  action: 'add' | 'map';
  usage: DiaryUsage;
}

/**
 * The diaries one place or person appears in, with the two repairs on each entry: turn the
 * unmatched text into a new record, or point it at one that already exists.
 *
 * Like the reference list it only picks — the AOC store does the writing and re-opens this
 * modal afterwards, so the same store↔modal import rule applies (no store injection here).
 */
@Component({
  selector: 'okr-diary-usage-list-modal',
  standalone: true,
  imports: [
    Header, EmptyList, SvgIconPipe,
    IonContent, IonList, IonItem, IonIcon, IonLabel, IonNote,
  ],
  styles: [`
    .item { --min-height: 44px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <okr-header [i18n]="{ title: reference().label }" [isModal]="true" />
    <ion-content>
      <ion-note class="ion-margin">{{ i18n.usage_title() }}</ion-note>
      @if(reference().usages.length === 0) {
        <okr-empty-list [message]="i18n.usage_empty()" />
      } @else {
        <ion-list lines="inset">
          @for(usage of reference().usages; track usage.okey) {
            <ion-item class="item" (click)="showActions(usage)" button>
              <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
              <ion-label>
                <h3>{{ dateOf(usage) }}</h3>
                <p>{{ usage.title || i18n.usage_untitled() }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class DiaryUsageListModal {
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  protected readonly i18n = inject(I18nService).translateAll(DIARY_I18N_KEYS) as DiaryI18n;

  // inputs
  public reference = input.required<DiaryReference>();
  /** imgix base url — the ActionSheet buttons need absolute icon urls, not pipe output */
  public iconBaseUrl = input.required<string>();

  protected readonly isLocation = computed(() => this.reference().kind === 'location');

  protected dateOf(usage: DiaryUsage): string {
    return formatDiaryDate(usage.date);
  }

  /**
   * `add` creates the missing record from the diary's own text, so it is offered only while the
   * reference is unresolved — for an already matched one it would just mint a duplicate.
   * `map` stays available in both states: it is also how a WRONG match gets corrected.
   */
  protected async showActions(usage: DiaryUsage): Promise<void> {
    const base = this.iconBaseUrl();
    const options: ActionSheetOptions = createActionSheetOptions(this.dateOf(usage));
    if (!this.reference().resolved) {
      const addLabel = this.isLocation() ? this.i18n.location_add() : this.i18n.person_add();
      options.buttons.push(createActionSheetButton('reference.add', addLabel, base, 'add'));
    }
    const mapLabel = this.isLocation() ? this.i18n.location_map() : this.i18n.person_map();
    options.buttons.push(createActionSheetButton('reference.map', mapLabel, base, 'link'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    if (data.action === 'reference.add') {
      await dismissOverlay(this.modalController, { action: 'add', usage } satisfies DiaryUsageListResult, 'confirm');
    } else if (data.action === 'reference.map') {
      await dismissOverlay(this.modalController, { action: 'map', usage } satisfies DiaryUsageListResult, 'confirm');
    }
  }
}
