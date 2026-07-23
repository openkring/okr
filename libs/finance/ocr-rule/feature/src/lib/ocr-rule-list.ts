import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonBadge, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

import { OcrRuleStore } from './ocr-rule.store';

@Component({
  selector: 'okr-ocr-rule-list',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonBadge, IonFab, IonFabButton, IonIcon,
    SvgIconPipe,
  ],
  providers: [OcrRuleStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p>Loading...</p>
      } @else if (store.rules().length === 0) {
        <p>{{ store.i18n.empty() }}</p>
      } @else {
        <ion-list>
          @for (rule of store.rules(); track rule.okey) {
            <ion-item button (click)="store.openEdit(rule, store.isReadOnly())">
              <ion-label>
                <h3>{{ rule.party }} → {{ rule.accountKey || '—' }}</h3>
                <p>{{ usageLabel(rule.ocrUsage) }} · Rang {{ rule.rank }}{{ (rule.aliases ?? []).length ? ' · ' + (rule.aliases ?? []).join(', ') : '' }}</p>
              </ion-label>
              @if (!rule.active) {
                <ion-badge slot="end" color="medium">{{ store.i18n.inactive() }}</ion-badge>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    @if (!store.isReadOnly()) {
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="store.openCreate()">
          <ion-icon src="{{ 'add' | svgIcon }}" />
        </ion-fab-button>
      </ion-fab>
    }
  `,
})
export class OcrRuleList {
  protected readonly store = inject(OcrRuleStore);
  private readonly route = inject(ActivatedRoute);

  /** Translated label for an OcrUsage value (falls back to the raw enum). */
  protected usageLabel(usage: string): string {
    switch (usage) {
      case 'invoice': return this.store.i18n.usage_invoice();
      case 'expense': return this.store.i18n.usage_expense();
      case 'paper': return this.store.i18n.usage_paper();
      default: return usage;
    }
  }

  constructor() {
    // Standalone route (not under AccountingShell): seed the accounting tenant from the param
    // so the account/VAT pickers load. Mirrors AccountingShell's own param → setTenant wiring.
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }
}
