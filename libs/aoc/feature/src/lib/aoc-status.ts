import { Component, computed, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonTitle, IonToolbar,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { StatusLevel, StatusPart, StatusService, dayLevel, serviceLevel, visibleParts } from '@okr/aoc-util';

import { AocStatusStore } from './aoc-status.store';

const LEVEL_COLOR: Record<StatusLevel, string> = {
  ok: 'success',
  degraded: 'warning',
  down: 'danger',
  maintenance: 'tertiary',
  unknown: 'medium',
};

/**
 * Dienst-Status (spec 1.137): one accordion per external service of this tenant. Open, it shows only
 * the parts we use, because a provider-wide warning that does not touch us is a false alarm.
 */
@Component({
  selector: 'okr-aoc-status',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonButton, IonIcon, IonTitle, IonContent,
    IonAccordionGroup, IonAccordion, IonList, IonItem, IonLabel, IonBadge, IonNote,
  ],
  providers: [AocStatusStore],
  styles: [`
    .wrap { max-width: 900px; margin: 0 auto; padding: 16px; }
    .summary { padding: 0 4px 12px; }
    .history { display: flex; gap: 1px; height: 18px; margin-top: 6px; }
    .day { flex: 1 1 0; min-width: 0; border-radius: 1px; background: var(--ion-color-medium); opacity: 0.35; }
    .day.ok { background: var(--ion-color-success); opacity: 1; }
    .day.degraded { background: var(--ion-color-warning); opacity: 1; }
    .day.down { background: var(--ion-color-danger); opacity: 1; }
    .day.maintenance { background: var(--ion-color-tertiary); opacity: 1; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="store.loading()" [attr.aria-label]="store.i18n.refresh()" (click)="store.load()">
            <ion-icon slot="icon-only" src="{{ 'reload' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="wrap">
        <div class="summary">
          @if (store.loading() && !store.result()) {
            <okr-spinner />
          } @else {
            <ion-label><strong>{{ summary() }}</strong></ion-label>
            @if (checkedAt(); as time) {
              <br /><ion-note>{{ time }}</ion-note>
            }
          }
        </div>
        <ion-accordion-group [multiple]="true">
          @for (service of store.services(); track service.id) {
            <ion-accordion [value]="service.id">
              <ion-item slot="header">
                <ion-label>{{ service.name }}</ion-label>
                @if (level(service); as current) {
                  @if (current !== 'none') {
                    <ion-badge slot="end" [color]="color(current)">{{ levelLabel(current) }}</ion-badge>
                  }
                }
                @if (service.statusUrl) {
                  <ion-button slot="end" fill="clear" [href]="service.statusUrl" target="_blank" rel="noopener"
                    [attr.aria-label]="store.i18n.open_page()" (click)="$event.stopPropagation()">
                    <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
                  </ion-button>
                }
              </ion-item>
              <ion-list slot="content" lines="none">
                @for (part of parts(service); track part.label) {
                  <ion-item>
                    <ion-label>
                      {{ part.label }}
                      @if (detail(service, part); as text) {
                        <ion-note class="ion-margin-start">{{ text }}</ion-note>
                      }
                      @if (history(service, part).length) {
                        <div class="history">
                          @for (day of history(service, part); track day.day) {
                            <span class="day" [class]="dayClass(day.status)" [title]="day.day"></span>
                          }
                        </div>
                      }
                    </ion-label>
                    <ion-badge slot="end" [color]="color(partLevel(service, part))">{{ levelLabel(partLevel(service, part)) }}</ion-badge>
                  </ion-item>
                } @empty {
                  <ion-item><ion-label color="medium">{{ store.i18n.no_live_status() }}</ion-label></ion-item>
                }
                @if (service.source === 'internal') {
                  <ion-item>
                    <ion-label class="ion-text-wrap">
                      <ion-note>{{ store.i18n.selftest_hint() }}</ion-note>
                      @if (store.testMessage(); as message) {
                        <p>{{ message }}</p>
                      }
                    </ion-label>
                    <ion-button slot="end" fill="outline" [disabled]="store.testing()" (click)="store.runSelftest()">
                      {{ store.i18n.test_now() }}
                    </ion-button>
                  </ion-item>
                }
                @if (service.statusUrl) {
                  <ion-item [href]="service.statusUrl" target="_blank" rel="noopener" detail="true">
                    <ion-label color="primary">{{ store.i18n.open_page() }}</ion-label>
                  </ion-item>
                }
              </ion-list>
            </ion-accordion>
          }
        </ion-accordion-group>
      </div>
    </ion-content>
  `,
})
export class AocStatus {
  protected readonly store = inject(AocStatusStore);

  protected readonly summary = computed(() => {
    const { problems, unknown } = this.store.summary();
    const i18n = this.store.i18n;
    if (this.store.failed()) return i18n.load_failed();
    if (problems === 1) return i18n.problem_one();
    if (problems > 1) return fill(i18n.problems(), { count: problems });
    return unknown > 0 ? i18n.some_unknown() : i18n.all_clear();
  });

  protected readonly checkedAt = computed(() => {
    const checkedAt = this.store.result()?.checkedAt;
    if (!checkedAt || this.store.failed()) return '';
    // 'en-US' is always registered, and HH:mm reads the same in every language
    return fill(this.store.i18n.checked_at(), { time: formatDate(checkedAt, 'HH:mm', 'en-US') });
  });

  protected level(service: StatusService): StatusLevel | 'none' {
    return serviceLevel(service, this.store.result()?.services[service.id], this.store.isEnabled());
  }

  protected parts(service: StatusService): StatusPart[] {
    return visibleParts(service, this.store.isEnabled());
  }

  protected partLevel(service: StatusService, part: StatusPart): StatusLevel {
    return this.store.result()?.services[service.id]?.parts[part.label]?.level ?? 'unknown';
  }

  protected detail(service: StatusService, part: StatusPart): string {
    return this.store.result()?.services[service.id]?.parts[part.label]?.detail ?? '';
  }

  protected history(service: StatusService, part: StatusPart) {
    return this.store.result()?.services[service.id]?.parts[part.label]?.history ?? [];
  }

  protected dayClass(status: string): string {
    return dayLevel(status);
  }

  protected color(level: StatusLevel): string {
    return LEVEL_COLOR[level];
  }

  protected levelLabel(level: StatusLevel): string {
    return this.store.i18n[`level_${level}`]();
  }
}
