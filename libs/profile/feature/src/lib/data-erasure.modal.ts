import { Component, computed, inject, input, signal } from '@angular/core';
import {
  IonButton, IonContent, IonFooter, IonInput, IonItem, IonLabel, IonList, IonListHeader,
  IonNote, IonSpinner, IonText, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import type { DataClass, ErasurePreview } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { PrivacyRightsService } from '@okr/profile-data-access';
import { ProfileI18n } from '@okr/profile-util';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * The erasure preflight report and its confirmation (plan task D3).
 *
 * Renders the six parts of `ErasurePreview` in the order the server returns them, which
 * is the order a member needs them: what stops this, what goes, what is kept and until
 * when, what is not touched at all, what is possible right now anyway, and who else holds
 * a copy.
 *
 * Three rules this template must keep (D-P5-2 and the plan):
 *
 * 1. **With a blocker present the confirm button is ABSENT, not disabled.** A greyed-out
 *    "delete" button reads as "the system is refusing you"; a missing one plus the reason
 *    reads as "here is what to do first", which is what is actually true.
 * 2. **Blocker and processor texts are rendered verbatim** from the server. They state
 *    what the law does and does not allow, and they are authored next to the rule that
 *    decides it — re-translating them here is how the two drift apart.
 * 3. **Nothing here renders a tenant list, a tenant count, or anything derived from
 *    `person.tenants`.** The report speaks about this tenant and never discloses whether
 *    the member belongs to another one.
 */
@Component({
  selector: 'okr-data-erasure-modal',
  standalone: true,
  imports: [
    Header, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonButton,
    IonFooter, IonToolbar, IonInput, IonSpinner, IonText,
  ],
  styles: [`
    .section-intro { padding: 0 16px 8px; }
    .blocker { --background: var(--ion-color-warning-tint); }
    ion-list-header ion-label { font-weight: 600; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().erasure_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (preview(); as report) {
        <p>{{ i18n().erasure_intro() }}</p>

        <!-- 1 — what stands in the way -->
        @if (report.blockers.length > 0) {
          <ion-list>
            <ion-list-header><ion-label>{{ i18n().erasure_blockers_title() }}</ion-label></ion-list-header>
            <div class="section-intro"><ion-note>{{ i18n().erasure_blockers_intro() }}</ion-note></div>
            @for (blocker of report.blockers; track blocker.code) {
              <ion-item class="blocker" lines="full">
                <ion-label class="ion-text-wrap">
                  <!-- verbatim, server-authored: see rule 2 above -->
                  <p>{{ blocker.detail }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- 5 — what is possible right now anyway (only ever non-empty while blocked) -->
        @if (report.canDeleteNow.length > 0) {
          <ion-list>
            <ion-list-header><ion-label>{{ i18n().erasure_now_title() }}</ion-label></ion-list-header>
            <div class="section-intro"><ion-note>{{ i18n().erasure_now_intro() }}</ion-note></div>
            @for (row of report.canDeleteNow; track row.collection) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ label(row.dataClass) }}</h3>
                  <p>{{ row.count }} {{ i18n().erasure_records() }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- 2 — what disappears -->
        @if (report.willDelete.length > 0) {
          <ion-list>
            <ion-list-header><ion-label>{{ i18n().erasure_delete_title() }}</ion-label></ion-list-header>
            @for (row of report.willDelete; track row.collection) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ label(row.dataClass) }}</h3>
                  <p>{{ row.count }} {{ i18n().erasure_records() }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- 3 — what is kept in pseudonymized form, and until when -->
        @if (report.willAnonymize.length > 0) {
          <ion-list>
            <ion-list-header><ion-label>{{ i18n().erasure_anonymize_title() }}</ion-label></ion-list-header>
            <div class="section-intro"><ion-note>{{ i18n().erasure_anonymize_intro() }}</ion-note></div>
            @for (row of report.willAnonymize; track row.collection) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ label(row.dataClass) }}</h3>
                  <p>{{ row.count }} {{ i18n().erasure_records() }}</p>
                  @if (row.legalBasis) { <p><ion-note>{{ row.legalBasis }}</ion-note></p> }
                  @if (row.retentionEndsAt) {
                    <p><ion-note>{{ i18n().erasure_until() }} {{ viewDate(row.retentionEndsAt) }}</ion-note></p>
                  }
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- 4 — what the erasure does not touch at all -->
        @if (report.willRetain.length > 0) {
          <ion-list>
            <ion-list-header><ion-label>{{ i18n().erasure_retain_title() }}</ion-label></ion-list-header>
            <div class="section-intro"><ion-note>{{ i18n().erasure_retain_intro() }}</ion-note></div>
            @for (row of report.willRetain; track row.collection) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ label(row.dataClass) }}</h3>
                  <p>{{ row.count }} {{ i18n().erasure_records() }}</p>
                  @if (row.legalBasis) { <p><ion-note>{{ row.legalBasis }}</ion-note></p> }
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- 6 — copies we cannot reach -->
        @if (report.outOfReach.length > 0) {
          <ion-list>
            <ion-list-header><ion-label>{{ i18n().erasure_reach_title() }}</ion-label></ion-list-header>
            <div class="section-intro"><ion-note>{{ i18n().erasure_reach_intro() }}</ion-note></div>
            @for (processor of report.outOfReach; track processor.key) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ processor.name }}</h3>
                  <!-- verbatim, server-authored -->
                  <p>{{ processor.contact }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        @if (isEmptyReport()) {
          <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().erasure_empty() }}</ion-label></ion-item>
        }

        @if (errorMessage(); as message) {
          <ion-item lines="none"><ion-text color="danger"><p>{{ message }}</p></ion-text></ion-item>
        }
      } @else {
        <ion-item lines="none">
          <ion-spinner slot="start" name="dots" />
          <ion-label>{{ i18n().erasure_loading() }}</ion-label>
        </ion-item>
      }
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        @if (canConfirm()) {
          <ion-item lines="none">
            <ion-input
              label="{{ i18n().erasure_confirm_label() }} «{{ i18n().erasure_confirm_phrase() }}»"
              labelPlacement="stacked"
              [value]="typed()"
              (ionInput)="typed.set($any($event.target).value ?? '')"
              autocapitalize="characters"
            />
          </ion-item>
          <ion-item lines="none"><ion-note>{{ i18n().erasure_confirm_helper() }}</ion-note></ion-item>
          <ion-button slot="end" color="danger" [disabled]="!phraseMatches() || isErasing()" (click)="confirm()">
            @if (isErasing()) { <ion-spinner slot="start" name="dots" /> }
            {{ isErasing() ? i18n().erasure_running() : i18n().erasure_confirm_button() }}
          </ion-button>
        }
        <ion-button slot="start" fill="clear" (click)="close()">{{ i18n().cancel() }}</ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class DataErasureModal {
  private readonly modalController = inject(ModalController);
  private readonly privacyRights = inject(PrivacyRightsService);

  public readonly i18n = input.required<ProfileI18n>();
  /** Loaded by the caller so the modal opens with the report already in hand. */
  public readonly preview = input.required<ErasurePreview | undefined>();

  protected readonly typed = signal('');
  protected readonly isErasing = signal(false);
  protected readonly errorMessage = signal('');

  /**
   * Rule 1: the confirm button EXISTS only when nothing blocks. With a blocker present it
   * is absent from the DOM, not disabled — and there is nothing to confirm when the report
   * is empty either.
   */
  protected readonly canConfirm = computed(() => {
    const report = this.preview();
    return !!report && report.blockers.length === 0 && !this.isEmptyReport();
  });

  protected readonly isEmptyReport = computed(() => {
    const report = this.preview();
    if (!report) return false;
    return report.blockers.length === 0
      && report.willDelete.length === 0
      && report.willAnonymize.length === 0
      && report.willRetain.length === 0;
  });

  /** Case-insensitive and whitespace-tolerant: the point is deliberate confirmation, not
   * a typing exam — and the phrase is uppercase in every language. */
  protected readonly phraseMatches = computed(
    () => this.typed().trim().toUpperCase() === this.i18n().erasure_confirm_phrase().trim().toUpperCase(),
  );

  protected label(dataClass: DataClass): string {
    const i18n = this.i18n();
    switch (dataClass) {
      case 'identity':      return i18n.class_identity();
      case 'contact':       return i18n.class_contact();
      case 'membership':    return i18n.class_membership();
      case 'financial':     return i18n.class_financial();
      case 'communication': return i18n.class_communication();
      case 'content':       return i18n.class_content();
      case 'consent':       return i18n.class_consent();
      case 'log':           return i18n.class_log();
    }
  }

  /** StoreDate (`yyyyMMdd`) → `dd.MM.yyyy`, without pulling a pipe in for one field. */
  protected viewDate(storeDate: string): string {
    return storeDate.length === 8
      ? `${storeDate.slice(6, 8)}.${storeDate.slice(4, 6)}.${storeDate.slice(0, 4)}`
      : storeDate;
  }

  protected async confirm(): Promise<void> {
    const report = this.preview();
    if (!report || this.isErasing()) return;

    this.isErasing.set(true);
    this.errorMessage.set('');
    const result = await this.privacyRights.eraseMyData(report.previewToken);
    this.isErasing.set(false);

    if (!result.ok) {
      // The server's German sentence, rendered as-is: a stale token or a blocker that
      // appeared since the preview is a normal answer, not a crash.
      this.errorMessage.set(result.message);
      return;
    }
    await dismissOverlay(this.modalController, { erased: true, result: result.value }, 'confirm');
  }

  protected close(): void {
    void dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
