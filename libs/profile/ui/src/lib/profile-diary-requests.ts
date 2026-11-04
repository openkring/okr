import { Component, computed, input, output } from "@angular/core";
import { IonAccordion, IonButton, IonItem, IonLabel, IonNote } from "@ionic/angular";

import { DiarySource } from "@okr/shared-models";
import { convertDateFormatToString, DateFormat } from "@okr/shared-util-core";
import { ProfileI18n } from "@okr/profile-util";

/**
 * One diary asking this app. Structurally the `DiaryRequest` that `DiaryLineService.listMyDiaryRequests` returns —
 * declared here so the ui lib does not depend on a data-access lib.
 */
export interface DiaryRequestRow {
  tenantId: string;
  title: string;
  from: string;
  to: string;
  requested: DiarySource[];
  consented: DiarySource[];
}

/**
 * Spec 1.77 §12.4 — «Tagebuch-Transfer» in the source app: the diaries that asked, each with what is still to allow and
 * what is allowed. No form: *Erlauben* and *Widerrufen* act at once, outside the profile's change-confirmation.
 */
@Component({
  selector: 'okr-profile-diary-requests-accordion',
  standalone: true,
  imports: [IonAccordion, IonItem, IonLabel, IonNote, IonButton],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-diary-requests">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().diaryTransfer_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">{{ i18n().diaryTransfer_description() }}</ion-label>
      </ion-item>
      @for (row of rows(); track row.tenantId) {
        <ion-item lines="full">
          <ion-label class="ion-text-wrap">
            {{ row.title }}
            @if (row.wanted) {
              <ion-note class="ion-text-wrap" style="display: block">{{ i18n().diaryTransfer_wants() }} {{ row.wanted }}{{ row.period }}</ion-note>
            }
            @if (row.allowed) {
              <ion-note class="ion-text-wrap" style="display: block">{{ i18n().diaryTransfer_allowed() }} {{ row.allowed }}</ion-note>
            }
          </ion-label>
          @if (row.wanted) {
            <ion-button slot="end" fill="clear" [disabled]="busy()" (click)="allow.emit(row.tenantId)">{{ i18n().diaryTransfer_allow() }}</ion-button>
          }
          @if (row.allowed) {
            <ion-button slot="end" fill="clear" color="medium" [disabled]="busy()" (click)="revoke.emit(row.tenantId)">{{ i18n().diaryTransfer_revoke() }}</ion-button>
          }
        </ion-item>
      }
    </div>
  </ion-accordion>
  `,
})
export class ProfileDiaryRequestsAccordion {
  public readonly i18n = input.required<ProfileI18n>();
  public readonly requests = input.required<DiaryRequestRow[]>();
  public readonly busy = input(false);
  public readonly color = input('primary');          // color of the accordion header

  public readonly allow = output<string>();
  public readonly revoke = output<string>();

  /** A larger request shows only its new rows; what is allowed already stands apart. */
  protected readonly rows = computed(() => this.requests().map((r) => ({
    tenantId: r.tenantId,
    title: r.title,
    wanted: r.requested.filter((s) => !r.consented.includes(s)).map((s) => this.sourceLabel(s)).join(', '),
    allowed: r.consented.map((s) => this.sourceLabel(s)).join(', '),
    period: this.period(r.from, r.to),
  })));

  private period(from: string, to: string): string {
    if (!from && !to) return '';
    return ` · ${this.date(from)} – ${this.date(to)}`;
  }

  private date(storeDate: string): string {
    return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) : '';
  }

  private sourceLabel(source: DiarySource): string {
    switch (source) {
      case 'taskDone': return this.i18n().diaryTransfer_source_taskDone();
      case 'jasstafel': return this.i18n().diaryTransfer_source_jasstafel();
      case 'tracker': return this.i18n().diaryTransfer_source_tracker();
      default: return source;
    }
  }
}
