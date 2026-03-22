import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBadge, IonContent, IonItem, IonLabel, IonList,
  IonNote, IonSearchbar, IonSelect, IonSelectOption, IonToolbar
} from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { HeaderComponent } from '@bk2/shared-ui';

export interface EmailEvent {
  bkey: string;
  event: string;
  message_id?: string;
  email?: string;
  from?: string;
  subject?: string;
  sending_stream?: string;
  category?: string;
  response?: string;
  timestamp?: number;
  receivedAt?: { seconds: number; nanoseconds: number };
}

const EVENT_COLOR: Record<string, string> = {
  delivery:    'success',
  delivered:   'success',
  open:        'primary',
  opened:      'primary',
  click:       'tertiary',
  clicked:     'tertiary',
  bounce:      'danger',
  bounced:     'danger',
  spam:        'warning',
  reject:      'danger',
  rejected:    'danger',
  unsubscribe: 'medium',
};

const EVENT_TYPES = ['delivery', 'open', 'click', 'bounce', 'spam', 'reject', 'unsubscribe'];

@Component({
  selector: 'bk-aoc-email',
  standalone: true,
  imports: [
    DatePipe,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonSelect, IonSelectOption,
    IonList, IonItem, IonLabel, IonNote, IonBadge,
  ],
  template: `
    <bk-header title="Email Events" />
    <ion-content>
      <ion-toolbar>
        <ion-searchbar [value]="searchTerm()"
          (ionInput)="searchTerm.set($any($event).detail.value ?? '')"
          placeholder="E-Mail, Betreff, Absender..." />
      </ion-toolbar>
      <ion-toolbar>
        <ion-select [value]="selectedType()"
          (ionChange)="selectedType.set($any($event).detail.value)"
          style="padding: 0 16px;">
          <ion-select-option value="all">Alle Event-Typen</ion-select-option>
          @for (type of eventTypes; track type) {
            <ion-select-option [value]="type">{{ type }}</ion-select-option>
          }
        </ion-select>
      </ion-toolbar>

      <ion-list>
        @for (ev of filteredEvents(); track ev.bkey) {
          <ion-item>
            <ion-badge slot="start" [color]="eventColor(ev.event)"
              style="min-width: 76px; text-align: center; margin-right: 12px;">
              {{ ev.event }}
            </ion-badge>
            <ion-label>
              <h3>{{ ev.email }}</h3>
              <p>{{ ev.subject }}</p>
              @if (ev.response) {
                <p><small>{{ ev.response }}</small></p>
              }
            </ion-label>
            <ion-note slot="end">
              {{ receivedAt(ev) | date:'dd.MM.yy HH:mm' }}
            </ion-note>
          </ion-item>
        } @empty {
          <ion-item>
            <ion-label color="medium">Keine Events gefunden.</ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `
})
export class AocEmailComponent {
  private readonly firestoreService = inject(FirestoreService);

  protected searchTerm = signal('');
  protected selectedType = signal('all');
  protected readonly eventTypes = EVENT_TYPES;

  protected eventsResource = rxResource({
    stream: () => this.firestoreService.searchData<EmailEvent>('emailEvents', [], 'receivedAt', 'desc')
  });

  protected filteredEvents = computed(() => {
    const events = this.eventsResource.value() ?? [];
    const term = this.searchTerm().toLowerCase();
    const type = this.selectedType();
    return events.filter(ev =>
      (type === 'all' || ev.event === type) &&
      (term.length === 0 ||
        ev.email?.toLowerCase().includes(term) ||
        ev.subject?.toLowerCase().includes(term) ||
        ev.from?.toLowerCase().includes(term))
    );
  });

  protected eventColor(event: string): string {
    return EVENT_COLOR[event] ?? 'medium';
  }

  protected receivedAt(ev: EmailEvent): Date | null {
    return ev.receivedAt ? new Date(ev.receivedAt.seconds * 1000) : null;
  }
}
