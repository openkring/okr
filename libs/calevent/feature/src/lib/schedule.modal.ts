import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { AlertController, IonContent, ModalController, ToastController } from '@ionic/angular/standalone';

import { InvitationState } from '@okr/shared-models';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';
import { SchedulePollForm } from '@okr/calevent-ui';
import { SchedulePollFormData, SchedulePollRow } from '@okr/calevent-util';

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
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)"
          (columnSelected)="onColumnSelected($event)" />
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
   * A live poll the user has no invitation for (the v1 flow skipped the organiser, and privileged
   * users may open any poll). Their taps could never be saved — so nothing may look editable.
   */
  protected readonly readOnly = computed(() => {
    if (this.isDraft()) return false;
    const myKey = this.store.currentUser()?.personKey ?? '';
    return !this.formData().rows.some(row => row.key === myKey);
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

    // Seed the editable table ONCE. Re-seeding on every invitation-stream emission would wipe the
    // user's unsaved cell taps (same trap as linkedSignal over an rxResource).
    effect(() => {
      const events = this.proposedEvents();
      const invitations = this.store.seriesInvitations();
      if (this.seeded || this.isDraft() || events.length === 0 || invitations.length === 0) return;
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
      rows: [{
        key: user?.personKey ?? '', firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '', responses: {}, comment: '',
      }],
    };
  }

  /** Column id == calevent okey, so the store can map a cell straight onto its invitation. */
  private buildLiveTable(): SchedulePollFormData {
    const events = this.proposedEvents();
    const myKey = this.store.currentUser()?.personKey ?? '';
    const rowsByKey = new Map<string, SchedulePollRow>();
    for (const inv of this.store.seriesInvitations()) {
      const row = rowsByKey.get(inv.inviteeKey) ?? {
        key: inv.inviteeKey, firstName: inv.inviteeFirstName, lastName: inv.inviteeLastName,
        responses: {}, comment: '',
      };
      row.responses[inv.caleventKey] = inv.state as InvitationState;
      // the same comment is written to every invitation of the member; any one of them is the truth
      if (inv.notes) row.comment = inv.notes;
      rowsByKey.set(inv.inviteeKey, row);
    }
    const rows = [...rowsByKey.values()].sort((a, b) =>
      a.key === myKey ? -1 : b.key === myKey ? 1 : a.lastName.localeCompare(b.lastName));
    return {
      name: events[0]?.name ?? '',
      description: events[0]?.description ?? '',
      columns: events.map(e => ({ id: e.okey, startDate: e.startDate, startTime: e.startTime, columnLabel: e.columnLabel ?? '' })),
      rows,
      isDraft: false,
    };
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
        await this.store.saveSchedulePollResponses(this.formData().rows);
      }
    } catch (err) {
      console.warn('ScheduleModal.save:', err);
      error(this.toastController, this.store.i18n.schedule_save_error());
      return;
    }
    await this.modalController.dismiss(null, 'confirm');
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

  /** The author picked a winning column: confirm, close the poll, dismiss. */
  protected async onColumnSelected(columnId: string): Promise<void> {
    const winner = this.proposedEvents().find(e => e.okey === columnId);
    if (!winner) return;
    const formattedDate = convertDateFormatToString(winner.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    const alert = await this.alertController.create({
      header: this.store.i18n.schedule_close(),
      message: this.store.i18n.schedule_close_message().replace('{date}', formattedDate),
      inputs: [{ name: 'authorMessage', type: 'textarea', placeholder: this.store.i18n.schedule_optional_message() }],
      buttons: [
        { text: this.store.i18n.cancel(), role: 'cancel' },
        {
          text: this.store.i18n.schedule_close(),
          handler: (data: { authorMessage?: string }) => {
            this.store.closeSchedule(winner, data.authorMessage)
              .then(() => this.modalController.dismiss(null, 'confirm'))
              .catch(err => console.warn('ScheduleModal.onColumnSelected: closeSchedule failed:', err));
          },
        },
      ],
    });
    await alert.present();
  }
}
