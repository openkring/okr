import { AsyncPipe } from '@angular/common';
import { Component, inject, input, computed } from '@angular/core';
import {
  IonButton,
  IonContent, IonAvatar,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';
import { CalEventStore } from './calevent.store';

@Component({
  selector: 'bk-schedule-table-modal',
  standalone: true,
  imports: [
    IonButton,
    IonContent, IonAvatar,
    AsyncPipe, TranslatePipe,
    HeaderComponent,
  ],
  template: `
    <bk-header title="@schedule.tableTitle" [isModal]="true" />
    <ion-content class="ion-padding">
      <div class="schedule-table-wrapper">
        <table class="schedule-table">
          <thead>
            <tr>
              <th class="member-col"></th>
              @for (event of proposedEvents(); track event.bkey) {
                <th class="date-col">
                  <div>{{ formatDayName(event.startDate) }}</div>
                  <div class="date-sub">{{ formatShortDate(event.startDate) }}</div>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (member of members(); track member.key) {
              <tr [class.my-row]="member.key === currentUserKey()">
                <td>
                  <div class="member-cell">
                    <ion-avatar class="small-avatar">
                      <div class="initials">{{ initials(member.firstName, member.lastName) }}</div>
                    </ion-avatar>
                    <span class="member-name">{{ member.firstName }} {{ member.lastName }}</span>
                  </div>
                </td>
                @for (event of proposedEvents(); track event.bkey) {
                  <td
                    [class.tappable]="member.key === currentUserKey()"
                    (click)="member.key === currentUserKey() ? toggleResponse(event.bkey) : null"
                  >
                    {{ responseIcon(member.key, event.bkey) }}
                  </td>
                }
              </tr>
            }
            <tr class="count-row">
              <td>Zusagen</td>
              @for (event of proposedEvents(); track event.bkey) {
                <td [class.best]="isBestDate(event.bkey)">
                  {{ acceptanceCount(event.bkey) }}{{ isBestDate(event.bkey) ? ' ★' : '' }}
                </td>
              }
            </tr>
          </tbody>
        </table>
      </div>
      @if (pendingCount() > 0) {
        <p class="pending-hint">
          {{ '@schedule.pendingCount' | translate | async }}
        </p>
      }
    </ion-content>
  `,
  styles: [`
    .schedule-table-wrapper { overflow-x: auto; }
    .schedule-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .schedule-table th, .schedule-table td { border: 1px solid var(--ion-color-light-shade); padding: 6px; text-align: center; }
    .member-col { min-width: 120px; text-align: left; }
    .member-cell { display: flex; align-items: center; gap: 8px; }
    .small-avatar { width: 28px; height: 28px; }
    .initials { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--ion-color-primary); color: white; font-size: 10px; font-weight: 700; border-radius: 50%; }
    .member-name { font-size: 12px; }
    .date-sub { font-size: 10px; color: var(--ion-color-medium); }
    .my-row td { background: var(--ion-color-light); }
    .tappable { cursor: pointer; }
    .count-row td { background: var(--ion-color-light-shade); font-weight: 600; }
    .count-row td.best { color: var(--ion-color-success); }
    .pending-hint { font-size: 12px; color: var(--ion-color-medium); font-style: italic; padding: 8px 0; }
  `],
})
export class ScheduleTableModal {
  private readonly modalCtrl = inject(ModalController);
  protected readonly store = inject(CalEventStore);

  readonly seriesId = input.required<string>();

  protected readonly proposedEvents = computed(() =>
    this.store.calEvents().filter(e => e.seriesId === this.seriesId() && e.state === 'proposed')
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  );

  protected readonly invitations = computed(() =>
    this.store.invitations().filter(inv =>
      this.proposedEvents().some(e => e.bkey === inv.caleventKey)
    )
  );

  protected readonly members = computed(() => {
    const seen = new Set<string>();
    const result: { key: string; firstName: string; lastName: string }[] = [];
    const myKey = this.currentUserKey();
    for (const inv of this.invitations()) {
      if (!seen.has(inv.inviteeKey)) {
        seen.add(inv.inviteeKey);
        if (inv.inviteeKey === myKey) {
          result.unshift({ key: inv.inviteeKey, firstName: inv.inviteeFirstName, lastName: inv.inviteeLastName });
        } else {
          result.push({ key: inv.inviteeKey, firstName: inv.inviteeFirstName, lastName: inv.inviteeLastName });
        }
      }
    }
    return result;
  });

  protected readonly currentUserKey = computed(() => this.store.currentUser()?.personKey ?? '');

  protected readonly pendingCount = computed(() => {
    const totalExpected = this.members().length * this.proposedEvents().length;
    const responded = this.invitations().filter(inv => inv.state !== 'pending').length;
    return Math.max(0, totalExpected - responded);
  });

  protected formatDayName(storeDate: string): string {
    const d = this.parseDateStr(storeDate);
    return d.toLocaleDateString('de-CH', { weekday: 'short' });
  }

  protected formatShortDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.DDMM, false);
  }

  private parseDateStr(storeDate: string): Date {
    return new Date(
      +storeDate.substring(0, 4),
      +storeDate.substring(4, 6) - 1,
      +storeDate.substring(6, 8)
    );
  }

  protected initials(first: string, last: string): string {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  protected responseIcon(memberKey: string, eventBkey: string): string {
    const inv = this.invitations().find(i => i.inviteeKey === memberKey && i.caleventKey === eventBkey);
    if (!inv || inv.state === 'pending') return '–';
    if (inv.state === 'accepted') return '✓';
    return '✗';
  }

  protected acceptanceCount(eventBkey: string): number {
    return this.invitations().filter(i => i.caleventKey === eventBkey && i.state === 'accepted').length;
  }

  protected isBestDate(eventBkey: string): boolean {
    const counts = this.proposedEvents().map(e => this.acceptanceCount(e.bkey));
    const max = Math.max(...counts);
    return max > 0 && this.acceptanceCount(eventBkey) === max;
  }

  protected toggleResponse(eventBkey: string): void {
    const inv = this.invitations().find(
      i => i.inviteeKey === this.currentUserKey() && i.caleventKey === eventBkey
    );
    if (!inv) return;
    const next = inv.state === 'accepted' ? 'declined' : 'accepted';
    this.store.changeInvitationState(inv, next);
  }

  protected async close(): Promise<void> {
    await this.modalCtrl.dismiss();
  }
}
