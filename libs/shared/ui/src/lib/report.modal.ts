import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton, IonContent, IonFooter, IonIcon, IonItem, IonLabel, IonList, IonNote, IonToolbar, ModalController
} from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';
import { ReportAction, ReportFinding, ReportKind, ReportResult } from '@okr/shared-util-core';

import { Chips } from './chips';
import { Header } from './header';
import { PFX } from './scope';

/**
 * Shared result modal of the domain checks (spec 1.101, phase 2): a kind badge, an explanation,
 * the findings (a tap on a finding with a `url` navigates there, an action button returns the
 * action to the caller), the time of the run and an optional «apply» footer button.
 * A finding with `chips` shows an editable chip list; each change goes to `onChipsChange` while the
 * modal stays open. Has no form, so it is not a form modal.
 */
@Component({
  selector: 'okr-report-modal',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe, Header, Chips,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonIcon, IonFooter, IonToolbar
  ],
  styles: [`
    .badge { display: inline-block; margin: 0 0 8px 0; padding: 2px 10px; border-radius: 12px;
      background: var(--ion-color-medium); color: var(--ion-color-medium-contrast); font-size: 0.8rem; }
    .explanation { margin: 0 0 12px 0; white-space: pre-line; }
    .empty { margin: 16px 0; }
    .detail { white-space: pre-line; }
    .actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .ran-at { display: block; margin-top: 12px; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <span class="badge">{{ kindLabel() }}</span>
      <p class="explanation">{{ explanation() }}</p>
      @if (findings().length === 0) {
        <p class="empty">{{ labels.empty() }}</p>
      } @else {
        <ion-list lines="full">
          @for (finding of findings(); track finding.id) {
            <ion-item [button]="!!finding.url" [detail]="!!finding.url" (click)="open(finding)">
              <ion-label class="ion-text-wrap">
                <h3>{{ finding.title }}</h3>
                @if (finding.detail) { <p class="detail">{{ finding.detail }}</p> }
                @if (finding.chips; as chips) {
                  <okr-chips [chipName]="chips.name" [storedChips]="chips.value" [allChips]="chips.all"
                    [readOnly]="!onChipsChange()" (storedChipsChange)="chipsChanged(finding, $event)" />
                }
                @if (finding.actions?.length) {
                  <div class="actions">
                    @for (action of finding.actions; track action.id) {
                      <ion-button size="small" fill="outline" [color]="action.danger ? 'danger' : 'primary'"
                        (click)="act($event, finding, action)">
                        @if (action.icon) { <ion-icon slot="start" src="{{ action.icon | svgIcon }}" /> }
                        {{ action.label }}
                      </ion-button>
                    }
                  </div>
                }
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
      <ion-note class="ran-at">{{ labels.ranAt() }}: {{ ranAt() | date: 'dd.MM.yyyy HH:mm' }}</ion-note>
    </ion-content>
    @if (applyLabel()) {
      <ion-footer>
        <ion-toolbar>
          <ion-button slot="end" (click)="apply()">{{ applyLabel() }}</ion-button>
        </ion-toolbar>
      </ion-footer>
    }
  `,
})
export class ReportModal {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);

  public readonly title = input.required<string>();
  public readonly kind = input.required<ReportKind>();
  public readonly explanation = input.required<string>();
  public readonly findings = input.required<ReportFinding[]>();
  public readonly ranAt = input.required<Date>();
  public readonly applyLabel = input<string | undefined>(undefined);
  public readonly onChipsChange = input<((findingId: string, value: string) => void | Promise<void>) | undefined>(undefined);

  // fixed labels come from the shared-ui bundle (@shared/ui.report.*)
  protected readonly labels = inject(I18nService).translateAll({
    report: PFX + 'report.kind.report',
    check: PFX + 'report.kind.check',
    operation: PFX + 'report.kind.operation',
    migration: PFX + 'report.kind.migration',
    empty: PFX + 'report.empty',
    ranAt: PFX + 'report.ranAt',
  });
  protected readonly kindLabel = computed(() => this.labels[this.kind()]());

  protected async open(finding: ReportFinding): Promise<void> {
    if (!finding.url) return;
    await dismissOverlay(this.modalController, undefined, 'navigate');
    await this.router.navigateByUrl(finding.url);
  }

  protected act(event: Event, finding: ReportFinding, action: ReportAction): void {
    event.stopPropagation(); // the item itself navigates
    const result: ReportResult = { kind: 'action', findingId: finding.id, actionId: action.id };
    void dismissOverlay(this.modalController, result, 'action');
  }

  protected chipsChanged(finding: ReportFinding, value: string): void {
    void this.onChipsChange()?.(finding.id, value);
  }

  protected apply(): void {
    const result: ReportResult = { kind: 'apply' };
    void dismissOverlay(this.modalController, result, 'apply');
  }
}

export interface OpenReportOptions {
  title: string;
  kind: ReportKind;
  explanation: string;
  findings: ReportFinding[];
  ranAt: Date;
  applyLabel?: string;
  /** saves a finding's edited chips (comma-separated); without it chips are read-only */
  onChipsChange?: (findingId: string, value: string) => void | Promise<void>;
}

/** Opens the report modal and resolves with the chosen action / apply, or undefined when closed or navigated away. */
export async function openReport(modalController: ModalController, opts: OpenReportOptions): Promise<ReportResult> {
  const modal = await modalController.create({
    component: ReportModal,
    componentProps: { ...opts },
  });
  await modal.present();
  const { data } = await modal.onWillDismiss<ReportResult>();
  return data;
}
