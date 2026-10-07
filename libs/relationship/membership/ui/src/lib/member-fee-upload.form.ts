import { ChangeDetectionStrategy, Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  BexioPosition, getAccountDescription, MemberFeeUploadFormModel, memberFeeUploadValidations, MembershipI18n,
} from '@okr/relationship-membership-util';

/**
 * Review of one member's fee invoice before it is sent to Bexio: the positions (read-only) plus
 * the free texts above and below them. The parent modal drives sending via the change-confirmation.
 */
@Component({
  selector: 'okr-member-fee-upload-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotesInput, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonLabel],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .account { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <!-- read-only: who is invoiced and which positions -->
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12"><strong>{{ memberName() }}</strong></ion-col>
              </ion-row>
              @for (pos of positions(); track $index) {
                <ion-row>
                  <ion-col size="4"><ion-label>{{ pos.text }}</ion-label></ion-col>
                  <ion-col size="2"><ion-label class="amount">{{ pos.unit_price }}</ion-label></ion-col>
                  <ion-col size="6"><ion-label class="account">{{ account(pos.account_id) }}</ion-label></ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="4"><ion-label><strong>{{ i18n().memberFee_total() }}</strong></ion-label></ion-col>
                <ion-col size="2"><ion-label class="amount"><strong>{{ total() }}</strong></ion-label></ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-notes-input [i18n]="headerI18n()" [value]="header()"
              (valueChange)="onFieldChange('header', $event)" [rows]="3"
              [maxLength]="descriptionLength" [errors]="headerErrors()" [readOnly]="isReadOnly()" />
            <okr-notes-input [i18n]="footerI18n()" [value]="footer()"
              (valueChange)="onFieldChange('footer', $event)" [rows]="5"
              [maxLength]="descriptionLength" [errors]="footerErrors()" [readOnly]="isReadOnly()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class MemberFeeUploadForm {
  // inputs
  public readonly i18n = input.required<MembershipI18n>();
  public formData = model.required<MemberFeeUploadFormModel>();
  public readonly memberName = input('');
  public readonly positions = input<BexioPosition[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly uploadForm = form(this.formData, (path) => validateVestTree(path, memberFeeUploadValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.uploadForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on both fields */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly total = computed(() => this.positions().reduce((sum, p) => sum + p.unit_price * p.amount, 0));

  protected readonly header = computed(() => this.formData()?.header ?? '');
  protected readonly footer = computed(() => this.formData()?.footer ?? '');

  private readonly validationResult = vestErrors(this.uploadForm);
  protected readonly headerErrors = computed(() => this.validationResult().getErrors('header'));
  protected readonly footerErrors = computed(() => this.validationResult().getErrors('footer'));

  protected readonly headerI18n = computed(() => ({
    name: 'header',
    label: this.i18n().memberFee_upload_header_label(),
    placeholder: this.i18n().memberFee_upload_header_placeholder(),
  } as NotesInputI18n));
  protected readonly footerI18n = computed(() => ({
    name: 'footer',
    label: this.i18n().memberFee_upload_footer_label(),
    placeholder: this.i18n().memberFee_upload_footer_placeholder(),
  } as NotesInputI18n));

  protected account(id: number): string {
    return getAccountDescription(id);
  }

  protected onFieldChange(fieldName: keyof MemberFeeUploadFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
