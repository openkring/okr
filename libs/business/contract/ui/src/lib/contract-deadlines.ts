import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonListHeader, IonNote } from '@ionic/angular/standalone';

import { ContractModel, DeadlineKind, NoticePeriod } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import {
  computeNextDeadline, CONTRACT_I18N_KEYS, ContractI18n, earliestTerminationDate, parseReminderMarkers,
} from '@okr/business-contract-util';

interface DeadlineRow { label: string; value: string; }

/** Read-only overview of a contract's notice terms and deadlines (spec 1.5 §8). */
@Component({
  selector: 'okr-contract-deadlines',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonListHeader, IonItem, IonLabel, IonNote],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-card-title { font-size: 1rem; }
  `],
  template: `
    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n.deadlines() }}</ion-card-title></ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-list lines="inset">
          @for (row of rows(); track row.label) {
            <ion-item>
              <ion-label class="ion-text-wrap">{{ row.label }}</ion-label>
              <ion-note slot="end">{{ row.value }}</ion-note>
            </ion-item>
          }
          @if (reminders().length > 0) {
            <ion-list-header><ion-label>{{ i18n.deadline_remindersSent() }}</ion-label></ion-list-header>
            @for (reminder of reminders(); track $index) {
              <ion-item>
                <ion-label class="ion-text-wrap">{{ reminder.label }}</ion-label>
                <ion-note slot="end">{{ reminder.value }}</ion-note>
              </ion-item>
            }
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `,
})
export class ContractDeadlines {
  protected readonly i18n = inject(I18nService).translateAll(CONTRACT_I18N_KEYS) as ContractI18n;

  public readonly contract = input.required<ContractModel>();

  private readonly today = getTodayStr(DateFormat.StoreDate);

  protected readonly rows = computed<DeadlineRow[]>(() => {
    const c = this.contract();
    const i = this.i18n;
    const rows: DeadlineRow[] = [
      { label: i.noticeOurs_label(), value: this.period(c.notice?.ours) },
      { label: i.noticeTheirs_label(), value: this.period(c.notice?.theirs) },
      { label: i.noticeTo_label(), value: i[`noticeTo_${c.notice?.to ?? 'anytime'}`]?.() ?? '' },
    ];
    const next = computeNextDeadline(c, this.today);
    rows.push({
      label: i.deadline_next(),
      value: next.date && next.kind ? `${this.view(next.date)} · ${this.kindLabel(next.kind)}` : i.deadline_none(),
    });
    if (!c.endDate && c.state !== 'noticeGiven' && c.state !== 'ended') {
      rows.push({ label: i.deadline_earliestTermination(), value: this.view(earliestTerminationDate(c, this.today)) });
    }
    if (c.state === 'noticeGiven' && c.effectiveEndDate) {
      rows.push({ label: i.notice_effectiveEnd(), value: this.view(c.effectiveEndDate) });
    }
    return rows;
  });

  protected readonly reminders = computed<DeadlineRow[]>(() =>
    parseReminderMarkers(this.contract().remindersSent).map((m) => ({
      label: this.kindLabel(m.kind),
      value: fill(this.i18n.deadline_reminder(), { lead: m.lead, date: this.view(m.date) }),
    })));

  private period(p: NoticePeriod | undefined): string {
    if (!p || !(p.duration > 0)) return this.i18n.deadline_notSet();
    return `${p.duration} ${this.i18n[`unit_${p.unit}`]?.() ?? p.unit}`;
  }

  private kindLabel(kind: DeadlineKind): string {
    return this.i18n[`deadlineKind_${kind}`]?.() ?? kind;
  }

  private view(storeDate: string): string {
    return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
  }
}
