// libs/aoc/feature/src/lib/aoc-session.ts
import { Component, inject } from '@angular/core';
import { IonBadge, IonButton, IonButtons, IonCard, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonItem, IonLabel, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { Spinner } from '@bk2/shared-ui';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

import { AocSessionStore, DateFilter } from './aoc-session.store';

@Component({
  selector: 'bk-aoc-session',
  standalone: true,
  imports: [
    Spinner,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonButton, IonTitle,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonBadge,
  ],
  providers: [AocSessionStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ sessions().length }} Sessions ({{ activeCount() }} active)</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="setFilter('today')" [color]="dateFilter() === 'today' ? 'primary' : 'medium'">Today</ion-button>
          <ion-button (click)="setFilter('week')" [color]="dateFilter() === 'week' ? 'primary' : 'medium'">Week</ion-button>
          <ion-button (click)="setFilter('all')" [color]="dateFilter() === 'all' ? 'primary' : 'medium'">All</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else {
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              {{ uniqueUserCount() }} users &nbsp;|&nbsp;
              {{ anonymousCount() }} anonymous &nbsp;|&nbsp;
              {{ activeCount() }} active
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        <!-- list header -->
        <ion-toolbar color="primary">
          <ion-item lines="none" color="primary">
            <ion-label><strong>User</strong></ion-label>
            <ion-label><strong>Browser</strong></ion-label>
            <ion-label><strong>OS</strong></ion-label>
            <ion-label><strong>Started</strong></ion-label>
            <ion-label><strong>Duration</strong></ion-label>
            <ion-label><strong>Status</strong></ion-label>
          </ion-item>
        </ion-toolbar>

        @for (session of sessions(); track session.bkey) {
          <ion-item>
            <ion-label>{{ session.userEmail || 'anonymous' }}</ion-label>
            <ion-label>{{ session.browser }}</ion-label>
            <ion-label>{{ session.os }}</ion-label>
            <ion-label>{{ formatDate(session.startedAt) }}</ion-label>
            <ion-label>{{ formatDuration(session) }}</ion-label>
            <ion-label>
              <ion-badge [color]="statusColor(session)">{{ statusLabel(session) }}</ion-badge>
            </ion-label>
          </ion-item>
        }
      }
    </ion-content>
  `,
})
export class AocSession {
  private readonly store = inject(AocSessionStore);

  protected readonly isLoading = this.store.isLoading;
  protected readonly sessions = this.store.sessions;
  protected readonly activeCount = this.store.activeCount;
  protected readonly uniqueUserCount = this.store.uniqueUserCount;
  protected readonly anonymousCount = this.store.anonymousCount;
  protected readonly dateFilter = this.store.dateFilter;

  protected setFilter(filter: DateFilter): void {
    this.store.setDateFilter(filter);
  }

  protected formatDate(sdt: string): string {
    if (!sdt) return '—';
    return convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime);
  }

  protected formatDuration(session: { isActive: boolean; durationSeconds: number }): string {
    if (session.isActive) return '—';
    const s = session.durationSeconds;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  protected statusLabel(session: { isActive: boolean; lastSeenAt: string }): string {
    if (!session.isActive) return 'ended';
    const parse = (sdt: string): number => {
      const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
      const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
      const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
      return new Date(y, mo, d, h, m, s).getTime();
    };
    const age = (Date.now() - parse(session.lastSeenAt)) / 1000 / 60;
    if (age > 30) return 'orphaned';
    if (age > 10) return 'stale';
    return 'active';
  }

  protected statusColor(session: { isActive: boolean; lastSeenAt: string }): string {
    const label = this.statusLabel(session);
    if (label === 'active') return 'success';
    if (label === 'stale') return 'tertiary';
    if (label === 'orphaned') return 'warning';
    return 'medium';
  }
}
