import { Component, computed, inject, input, linkedSignal, OnInit, signal } from '@angular/core';
import {
  AlertController, IonContent, IonInput, IonItem, IonLabel, IonNote,
  IonSelect, IonSelectOption, IonSpinner, IonText, ModalController,
} from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ButtonCopy, Header } from '@okr/shared-ui';
import { confirm } from '@okr/shared-util-angular';

import { CALEVENT_I18N_KEYS, CaleventI18n } from '@okr/calevent-util';
import { CalendarFeedService } from '@okr/calevent-data-access';

/** One selectable calendar, besides the always-present "Mein Kalender" (`key: 'my'`) entry. */
export interface CalendarSyncOption {
  key: string;
  title: string;
}

/**
 * Shows the `webcal://` subscription link for a calendar and lets the user copy it or reset it
 * (invalidating every device that has already subscribed). Read-only and single-action, like
 * `CalEventInfoModal` — same shape: `Header` with `[isModal]="true"`, `I18nService` injected
 * directly (no store, so `ui` never points back at `feature`), and an exported opener at the
 * end of the file.
 *
 * The token is fetched once on open (`ensureToken()`); the displayed URL is a `computed()` over
 * the token signal and the calendar-selection signal, so switching the `ion-select` recomputes
 * it without another round trip — only "Link zurücksetzen" calls the backend again.
 */
@Component({
  selector: 'okr-calendar-sync-modal',
  standalone: true,
  imports: [
    Header, ButtonCopy,
    IonContent, IonItem, IonLabel, IonSelect, IonSelectOption, IonInput, IonNote, IonSpinner, IonText,
  ],
  styles: [`
    .sheet {
      max-width: 640px;
      margin: 0 auto;
      padding: 24px 24px 32px;
    }
    .intro { margin: 0 0 20px; font-size: 15px; line-height: 1.5; }
    .hint {
      margin-top: 8px;
      padding: 14px 16px;
      background: var(--ion-color-light);
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--ion-color-medium-shade);
    }
    .reset-row { margin-top: 20px; text-align: end; }
    .error { color: var(--ion-color-danger); font-size: 14px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.sync_title() }" [isModal]="true" />
    <ion-content>
      <div class="sheet">
        <p class="intro">{{ i18n.sync_intro() }}</p>

        <ion-item>
          <ion-label position="stacked">{{ i18n.sync_calendar_label() }}</ion-label>
          <ion-select [value]="selected()" (ionChange)="selected.set($any($event).detail.value)" interface="popover">
            <ion-select-option value="my">{{ i18n.sync_my_calendar() }}</ion-select-option>
            @for (calendar of calendars(); track calendar.key) {
              <ion-select-option [value]="calendar.key">{{ calendar.title }}</ion-select-option>
            }
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">{{ i18n.sync_url_label() }}</ion-label>
          @if (isLoading()) {
            <ion-spinner name="dots" slot="end" />
          } @else {
            <ion-input [value]="url()" readonly="true" />
            <okr-button-copy slot="end" [i18n]="{ copy_conf: i18n.sync_copied() }" [value]="url()" [label]="i18n.sync_copy()" />
          }
        </ion-item>

        @if (loadError()) {
          <ion-note class="error">{{ loadError() }}</ion-note>
        }

        <p class="hint">{{ i18n.sync_hint_readonly() }}</p>

        <div class="reset-row">
          <ion-text (click)="resetLink()" color="danger" style="cursor: pointer;">{{ i18n.sync_reset() }}</ion-text>
        </div>
      </div>
    </ion-content>
  `,
})
export class CalendarSyncModal implements OnInit {
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;
  private readonly calendarFeedService = inject(CalendarFeedService);
  private readonly alertController = inject(AlertController);

  /** Calendars offered besides the always-present "Mein Kalender" — passed in by the opener. */
  public readonly calendars = input<CalendarSyncOption[]>([]);
  /** The calendar key preselected by the opener: `'my'` or one of `calendars()`'s keys. */
  public readonly initialSelection = input('my');
  /** Currently selected calendar key, changeable via the `ion-select`. */
  protected readonly selected = linkedSignal(() => this.initialSelection());

  private readonly token = signal<string | undefined>(undefined);
  protected readonly isLoading = computed(() => this.token() === undefined && !this.loadError());
  protected readonly loadError = signal<string | undefined>(undefined);

  protected readonly url = computed(() => {
    const token = this.token();
    return token ? this.calendarFeedService.feedUrl(token, this.selected()) : '';
  });

  public ngOnInit(): void {
    void this.loadToken();
  }

  private async loadToken(regenerate = false): Promise<void> {
    this.loadError.set(undefined);
    if (regenerate) {
      this.token.set(undefined);
    }
    try {
      this.token.set(await this.calendarFeedService.ensureToken(regenerate));
    } catch (ex) {
      // Offline, AppCheck rejection or unauthenticated: never leave the field silently blank —
      // show an inline message instead. There is no dedicated i18n key for this edge case
      // (Task 7 did not define one), so the raw error is shown for now; a follow-up can add
      // a translated message once this failure mode has field data on which case is common.
      this.loadError.set(`${ex}`);
    }
  }

  protected async resetLink(): Promise<void> {
    const confirmed = await confirm(this.alertController, this.i18n.sync_reset_confirm(), this.i18n.ok(), this.i18n.cancel(), true);
    if (confirmed) {
      await this.loadToken(true);
    }
  }
}

/**
 * Opens the calendar-sync modal. Exported so every entry point (the menu item added in a later
 * task) opens the same modal the same way.
 */
export async function showCalendarSync(modalController: ModalController, options: { calendars: CalendarSyncOption[]; selected: string }): Promise<void> {
  const modal = await modalController.create({
    component: CalendarSyncModal,
    componentProps: { calendars: options.calendars, initialSelection: options.selected },
  });
  await modal.present();
  await modal.onDidDismiss();
}
