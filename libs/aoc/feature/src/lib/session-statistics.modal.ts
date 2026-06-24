import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { getSessionStatus, SessionStatus } from '@bk2/session-util';
import { AocI18n } from '@bk2/aoc-util';

interface CountRow { key: string; count: number; }

@Component({
  selector: 'bk-session-statistics-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol, IonList, IonListHeader, IonItem, IonLabel,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row><ion-col size="8">{{ i18n().session_stats_total() }}</ion-col><ion-col size="4">{{ total() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_stats_users() }}</ion-col><ion-col size="4">{{ uniqueUsers() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_stats_anonymous() }}</ion-col><ion-col size="4">{{ anonymous() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_status_active() }}</ion-col><ion-col size="4">{{ statusCount('active') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_status_stale() }}</ion-col><ion-col size="4">{{ statusCount('stale') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_status_orphaned() }}</ion-col><ion-col size="4">{{ statusCount('orphaned') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_status_ended() }}</ion-col><ion-col size="4">{{ statusCount('ended') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_stats_avg_duration() }}</ion-col><ion-col size="4">{{ avgDuration() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">{{ i18n().session_stats_median_duration() }}</ion-col><ion-col size="4">{{ medianDuration() }}</ion-col></ion-row>
      </ion-grid>

      <ion-list>
        <ion-list-header>{{ i18n().session_stats_by_browser() }}</ion-list-header>
        @for (row of byBrowser(); track row.key) {
          <ion-item><ion-label>{{ row.key }}</ion-label><ion-label slot="end">{{ row.count }}</ion-label></ion-item>
        }
        <ion-list-header>{{ i18n().session_stats_by_os() }}</ion-list-header>
        @for (row of byOs(); track row.key) {
          <ion-item><ion-label>{{ row.key }}</ion-label><ion-label slot="end">{{ row.count }}</ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class SessionStatisticsModal {
  private readonly modalController = inject(ModalController);

  public sessions = input.required<SessionModel[]>();
  public i18n = input.required<AocI18n>();
  public title = input('Session-Statistik');
  public closeLabel = input('Schliessen');

  protected total = computed(() => this.sessions().length);
  protected uniqueUsers = computed(() => new Set(this.sessions().filter(s => s.userKey).map(s => s.userKey)).size);
  protected anonymous = computed(() => this.sessions().filter(s => !s.userKey).length);

  protected statusCount(status: SessionStatus): number {
    const now = Date.now();
    return this.sessions().filter(s => getSessionStatus(s, now) === status).length;
  }

  private endedDurations = computed(() => this.sessions().filter(s => !s.isActive && s.durationSeconds > 0).map(s => s.durationSeconds));

  protected avgDuration = computed(() => {
    const d = this.endedDurations();
    if (d.length === 0) return '—';
    return this.fmt(Math.round(d.reduce((a, b) => a + b, 0) / d.length));
  });

  protected medianDuration = computed(() => {
    const d = [...this.endedDurations()].sort((a, b) => a - b);
    if (d.length === 0) return '—';
    const mid = Math.floor(d.length / 2);
    const med = d.length % 2 ? d[mid] : Math.round((d[mid - 1] + d[mid]) / 2);
    return this.fmt(med);
  });

  protected byBrowser = computed<CountRow[]>(() => this.groupCount(s => s.browser));
  protected byOs = computed<CountRow[]>(() => this.groupCount(s => s.os));

  private groupCount(keyFn: (s: SessionModel) => string): CountRow[] {
    const map = new Map<string, number>();
    for (const s of this.sessions()) map.set(keyFn(s), (map.get(keyFn(s)) ?? 0) + 1);
    return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }

  private fmt(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
