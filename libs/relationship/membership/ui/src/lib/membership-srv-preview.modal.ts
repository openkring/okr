import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonRow, ModalController } from '@ionic/angular';

import { SrvPreview } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, formatRegasoftModified } from '@okr/shared-util-core';
import { MembershipI18n } from '@okr/relationship-membership-util';

interface SrvPreviewRow {
  field:  string;
  before: string;
  after:  string;
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Regasoft sends dates as `YYYY-MM-DDTHH:mm:ss`; show them as view dates, anything else as text. */
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    if (ISO_DATE_TIME.test(value)) return convertDateFormatToString(value, DateFormat.IsoDateTime, DateFormat.ViewDate, false);
    if (ISO_DATE.test(value)) return convertDateFormatToString(value, DateFormat.IsoDate, DateFormat.ViewDate, false);
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Confirmation dialog before a write to Regasoft (spec 1.133 D12): lists the fields that change,
 * what Regasoft holds now and what it will hold after. Dismisses with role 'confirm' or 'cancel'.
 */
@Component({
  selector: 'okr-membership-srv-preview-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ChangeConfirmation, IonContent, IonGrid, IonRow, IonCol],
  styles: [`
    ion-row { border-bottom: 1px solid var(--ion-color-light); }
    .after { font-weight: 500; }
    .modified { color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().srv_preview_title() }" [isModal]="true" />
    <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="confirm()" />
    <ion-content class="ion-padding">
      <p class="modified">{{ modifiedNote() }}</p>
      <ion-grid>
        <ion-row>
          <ion-col size="4"><strong>{{ i18n().srv_col_attribute() }}</strong></ion-col>
          <ion-col size="4"><strong>{{ i18n().srv_preview_before() }}</strong></ion-col>
          <ion-col size="4"><strong>{{ i18n().srv_preview_after() }}</strong></ion-col>
        </ion-row>
        @for (row of rows(); track row.field) {
          <ion-row>
            <ion-col size="4">{{ row.field }}</ion-col>
            <ion-col size="4">{{ row.before || '—' }}</ion-col>
            <ion-col size="4" class="after">{{ row.after || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `,
})
export class MembershipSrvPreviewModal {
  private readonly modalController = inject(ModalController);

  public preview = input.required<SrvPreview>();
  public i18n = input.required<MembershipI18n>();

  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().srv_preview_confirm(),
  }));

  /** When Regasoft last changed the record, so a recent change by the Sekretariat is seen first (C5). */
  protected readonly modifiedNote = computed(() => {
    const date = formatRegasoftModified(this.preview().modified);
    return date ? fill(this.i18n().srv_preview_modified(), { date }) : this.i18n().srv_preview_modified_unknown();
  });

  /** only the written fields whose value differs; the records are large (license image), so never list them whole */
  protected readonly rows = computed<SrvPreviewRow[]>(() => {
    const { before, after, payload } = this.preview();
    return Object.keys(payload)
      .map((field) => ({ field, before: displayValue(before[field]), after: displayValue(after[field]) }))
      .filter((row) => row.before !== row.after);
  });

  protected async confirm(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'confirm');
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}
