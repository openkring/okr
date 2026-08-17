import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AlertController, IonContent, ModalController } from '@ionic/angular/standalone';

import { InvitationState } from '@okr/shared-models';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
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
      @if (showForm()) {
        <okr-schedule-poll-form
          [formData]="formData()" (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n" [canClose]="canClose()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)"
          (columnSelected)="onColumnSelected($event)" />
      }
    </ion-content>
  `,
})
export class ScheduleModal {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
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

  protected readonly proposedEvents = computed(() =>
    this.store.calEvents()
      .filter(e => e.seriesId === this.seriesId() && e.state === 'proposed')
      .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime)));

  constructor() {
    // tell the store which series to stream invitations for
    effect(() => this.store.setScheduleSeriesId(this.seriesId()));

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
      name: '', description: '', columns: [], isDraft: true,
      rows: [{
        key: user?.personKey ?? '', firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '', responses: {},
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
        key: inv.inviteeKey, firstName: inv.inviteeFirstName, lastName: inv.inviteeLastName, responses: {},
      };
      row.responses[inv.caleventKey] = inv.state as InvitationState;
      rowsByKey.set(inv.inviteeKey, row);
    }
    const rows = [...rowsByKey.values()].sort((a, b) =>
      a.key === myKey ? -1 : b.key === myKey ? 1 : a.lastName.localeCompare(b.lastName));
    return {
      name: events[0]?.name ?? '',
      description: events[0]?.description ?? '',
      columns: events.map(e => ({ id: e.okey, startDate: e.startDate, startTime: e.startTime })),
      rows,
      isDraft: false,
    };
  }

  protected onFormDataChange(data: SchedulePollFormData): void {
    this.formData.set(data);
  }

  protected async save(): Promise<void> {
    if (this.isDraft()) {
      await this.store.createSchedulePoll(this.formData(), window.location.origin);
    } else {
      await this.store.saveSchedulePollResponses(this.formData().rows);
    }
    await this.modalController.dismiss(null, 'confirm');
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
