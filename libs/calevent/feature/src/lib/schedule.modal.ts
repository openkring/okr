import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { AlertController, IonContent, ModalController, ToastController } from '@ionic/angular/standalone';

import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { dismissOverlay, error } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';
import { SchedulePollForm } from '@okr/calevent-ui';
import { buildSchedulePollTable, SchedulePollFormData } from '@okr/calevent-util';

import { CalEventStore } from './calevent.store';

@Component({
  selector: 'okr-schedule-modal',
  standalone: true,
  imports: [IonContent, Header, ChangeConfirmation, SchedulePollForm],
  template: `
    <okr-header [i18n]="{ title: store.i18n.schedule_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation
        [i18n]="{ cancel: store.i18n.cancel(), save: saveLabel() }"
        (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (pollMissing()) {
        <div class="empty">{{ store.i18n.schedule_not_found() }}</div>
      } @else if (showForm()) {
        <okr-schedule-poll-form
          [formData]="formData()" (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n" [canClose]="canClose()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          [locale]="store.getLocale()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)"
          (columnSelected)="onColumnSelected([$event])"
          (columnsSelected)="onColumnSelected($event)" />
      }
    </ion-content>
  `,
  styles: [`.empty { padding: 20px; color: var(--ion-color-medium); }`],
})
export class ScheduleModal implements OnDestroy {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  protected readonly store = inject(CalEventStore);

  public readonly seriesId = input('');

  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly formData = signal<SchedulePollFormData>(this.emptyDraft());
  private seeded = false;

  protected readonly isDraft = computed(() => this.seriesId().length === 0);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly saveLabel = computed(() =>
    this.isDraft() ? this.store.i18n.schedule_start() : this.store.i18n.save());

  /**
   * Only the author (or a privileged user) may pick the winning date on a live poll.
   * `canChange` lives on CalEventList, not on the store — so the check is done here.
   */
  protected readonly canClose = computed(() => {
    if (this.isDraft() || this.proposedEvents().length === 0) return false;
    const user = this.store.currentUser();
    if (!user) return false;
    const author = this.proposedEvents()[0].responsiblePersons[0]?.key ?? '';
    return author === user.personKey || hasRole('privileged', user);
  });

  /**
   * A live poll the user is not a member of (privileged users may open any poll via its link).
   * Their taps would be written to a group they do not belong to — so nothing may look editable.
   *
   * Membership, not "has a row": rows now come from the group list, so everybody in the table has
   * one from the start and the old check would have made every poll editable by anyone.
   */
  protected readonly readOnly = computed(() => {
    if (this.isDraft()) return false;
    const myKey = this.store.currentUser()?.personKey ?? '';
    return !this.store.scheduleMembers().some(member => member.memberKey === myKey);
  });

  /**
   * A stale deep link: the series is gone (closed or deleted) — say so instead of showing a table.
   * The `calEvents().length` guard keeps the message off the screen while the calendar is still
   * loading; an empty calendar would otherwise be reported as a deleted poll.
   */
  protected readonly pollMissing = computed(() =>
    !this.isDraft() && this.store.calEvents().length > 0 && this.proposedEvents().length === 0);

  protected readonly proposedEvents = computed(() =>
    this.store.calEvents()
      .filter(e => e.seriesId === this.seriesId() && e.state === 'proposed')
      // same order as the draft table: dates first, text columns last ('9' sorts after any yyyyMMdd)
      .sort((a, b) => (a.columnLabel ? '9' + a.columnLabel : a.startDate + a.startTime)
        .localeCompare(b.columnLabel ? '9' + b.columnLabel : b.startDate + b.startTime)));

  constructor() {
    // tell the store which series to stream invitations for. `seriesId` is an input, so it is still
    // '' while the field initialisers run — keep formData.isDraft in step with it once it arrives.
    effect(() => {
      const seriesId = this.seriesId();
      this.store.setScheduleSeriesId(seriesId);
      untracked(() => this.formData.update(data => ({ ...data, isDraft: seriesId.length === 0 })));
    });

    // Seed the editable table ONCE. Re-seeding on every calevent-stream emission would wipe the
    // user's unsaved cell taps (same trap as linkedSignal over an rxResource).
    //
    // Guarded on the MEMBER list, not on the answers: an invitation-less poll starts with no
    // answers at all, so waiting for one would leave the table empty until somebody responded.
    effect(() => {
      const events = this.proposedEvents();
      const members = this.store.scheduleMembers();
      if (this.seeded || this.isDraft() || events.length === 0 || members.length === 0) return;
      untracked(() => {
        this.formData.set(this.buildLiveTable());
        this.seeded = true;
      });
    });
  }

  private emptyDraft(): SchedulePollFormData {
    const user = this.store.currentUser();
    return {
      name: '', description: '', columns: [], isDraft: this.seriesId().length === 0,
      // 'Ein Termin suchen' is the default; the organizer switches to 'Mehrere Termine festlegen'
      multiSelect: false,
      rows: [{
        key: user?.personKey ?? '', firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '', responses: {}, comment: '',
      }],
    };
  }

  /** Column id == calevent okey, so the store can map a cell straight onto that event's attendees. */
  private buildLiveTable(): SchedulePollFormData {
    return buildSchedulePollTable(
      this.proposedEvents(),
      this.store.scheduleMembers().map(member => ({
        key: member.memberKey, firstName: member.memberName1, lastName: member.memberName2,
      })),
      this.store.currentUser()?.personKey ?? '',
    );
  }

  protected onFormDataChange(data: SchedulePollFormData): void {
    this.formData.set(data);
  }

  /** Dismisses only when the write actually went through — a failure must never look like a save. */
  protected async save(): Promise<void> {
    try {
      if (this.isDraft()) {
        await this.store.createSchedulePoll(this.formData(), window.location.origin);
      } else {
        await this.store.saveSchedulePollResponses(this.proposedEvents(), this.formData().rows);
      }
    } catch (err) {
      console.warn('ScheduleModal.save:', err);
      error(this.toastController, this.store.i18n.schedule_save_error());
      return;
    }
    await dismissOverlay(this.modalController, null, 'confirm');
  }

  /**
   * The series subscription is page-lifetime state on the store; without this it keeps streaming
   * invitations long after the modal is gone. Safe here: dismiss happens after save() awaited.
   */
  public ngOnDestroy(): void {
    this.store.setScheduleSeriesId('');
  }

  protected cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.isDraft() ? this.emptyDraft() : this.buildLiveTable());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /**
   * The author picked the winning column(s): confirm, close the poll, dismiss. One id arrives from
   * the per-column button ('Ein Termin suchen'), several from the header checkboxes ('Mehrere
   * Termine festlegen') — the confirmation names every date either way.
   */
  protected async onColumnSelected(columnIds: string[]): Promise<void> {
    const winners = this.proposedEvents().filter(e => columnIds.includes(e.okey));
    if (winners.length === 0) return;
    const formattedDates = winners
      .map(w => convertDateFormatToString(w.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false));
    const message = winners.length === 1
      ? this.store.i18n.schedule_close_message().replace('{date}', formattedDates[0])
      : this.store.i18n.schedule_close_multi_message().replace('{dates}', formattedDates.join(', '));
    const alert = await this.alertController.create({
      header: this.store.i18n.schedule_close(),
      message,
      inputs: [{ name: 'authorMessage', type: 'textarea', placeholder: this.store.i18n.schedule_optional_message() }],
      buttons: [
        { text: this.store.i18n.cancel(), role: 'cancel' },
        {
          text: this.store.i18n.schedule_close(),
          handler: (data: { authorMessage?: string }) => {
            this.store.closeSchedule(winners, data.authorMessage)
              .then(() => dismissOverlay(this.modalController, null, 'confirm'))
              .catch(err => console.warn('ScheduleModal.onColumnSelected: closeSchedule failed:', err));
          },
        },
      ],
    });
    await alert.present();
  }
}
