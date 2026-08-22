import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';

import { CalEventModel, InvitationModel } from '@okr/shared-models';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { dismissOverlay, error } from '@okr/shared-util-angular';
import { SchedulePollForm } from '@okr/calevent-ui';
import { buildSeriesAttendanceTable, SchedulePollFormData } from '@okr/calevent-util';

import { CalEventStore } from './calevent.store';

/**
 * The tabular attendance view of one calevent series: one column per upcoming occurrence, one row
 * per member, the current user's row editable. Same table as the schedule poll — but the series is
 * live, so there is no winner to pick and no column to add; only answers are written.
 *
 * The occurrences are loaded by seriesId (NOT from calEvents(), which is narrowed by calendar,
 * maxEvents and the past/upcoming filters) and seeded once: re-seeding from a live stream would
 * wipe the user's unsaved taps.
 */
@Component({
  selector: 'okr-series-attendance-modal',
  standalone: true,
  imports: [IonContent, Header, ChangeConfirmation, SchedulePollForm],
  template: `
    <okr-header [i18n]="{ title: store.i18n.series_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation
        [i18n]="{ cancel: store.i18n.cancel(), save: store.i18n.save() }"
        (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (seriesEmpty()) {
        <div class="empty">{{ store.i18n.series_not_found() }}</div>
      } @else if (showForm() && seeded()) {
        <okr-schedule-poll-form
          [formData]="formData()" (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n" [seriesMode]="true"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
  styles: [`.empty { padding: 20px; color: var(--ion-color-medium); }`],
})
export class SeriesAttendanceModal {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  protected readonly store = inject(CalEventStore);

  public readonly seriesId = input('');

  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly seeded = signal(false);
  /** Plain flag, not the signal: the load guard must not re-trigger the effect that sets it. */
  private loading = false;
  protected readonly formData = signal<SchedulePollFormData>(this.emptyTable());

  /** The occurrences and invitations the table was built from — the save writes back to exactly these. */
  private readonly seriesEvents = signal<CalEventModel[]>([]);
  private readonly seriesInvitations = signal<InvitationModel[]>([]);

  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());

  /** Loaded, but nothing upcoming left to answer (all past, cancelled or archived). */
  protected readonly seriesEmpty = computed(() => this.seeded() && this.formData().columns.length === 0);

  /** No answerable occurrence at all — a closed series the user was never invited to. */
  protected readonly readOnly = computed(() => this.formData().columns.every(column => column.locked));

  /** The date the calendar returns to when the modal closes: the first occurrence shown. */
  public firstDate(): string {
    return this.formData().columns[0]?.startDate ?? '';
  }

  constructor() {
    effect(() => {
      const seriesId = this.seriesId();
      if (!seriesId || this.loading) return;
      this.loading = true;
      untracked(() => void this.load(seriesId));
    });
  }

  private async load(seriesId: string): Promise<void> {
    const events = await this.store.loadSeriesEvents(seriesId);
    const invitations = await this.store.loadInvitationsFor(events.map(event => event.okey));
    const user = this.store.currentUser();
    this.seriesEvents.set(events);
    this.seriesInvitations.set(invitations);
    this.formData.set(buildSeriesAttendanceTable(events, invitations, {
      key: user?.personKey ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '',
    }));
    this.seeded.set(true);
  }

  private emptyTable(): SchedulePollFormData {
    return { name: '', description: '', columns: [], rows: [], isDraft: false };
  }

  protected onFormDataChange(data: SchedulePollFormData): void {
    this.formData.set(data);
  }

  /** Dismisses only when the write actually went through — a failure must never look like a save. */
  protected async save(): Promise<void> {
    const myRow = this.formData().rows[0];
    if (!myRow) return;
    try {
      await this.store.saveSeriesAttendance(this.seriesEvents(), this.seriesInvitations(), myRow);
    } catch (err) {
      console.warn('SeriesAttendanceModal.save:', err);
      error(this.toastController, this.store.i18n.series_save_error());
      return;
    }
    await dismissOverlay(this.modalController, null, 'confirm');
  }

  /** Reverts to the stored answers and forces a fresh form so Vest drops its state. */
  protected cancel(): void {
    this.formDirty.set(false);
    const user = this.store.currentUser();
    this.formData.set(buildSeriesAttendanceTable(this.seriesEvents(), this.seriesInvitations(), {
      key: user?.personKey ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '',
    }));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
