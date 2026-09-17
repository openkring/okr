import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, AlertController,
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonIcon, IonItem, IonLabel, IonList, ModalController
} from '@ionic/angular/standalone';

import { ENV } from '@okr/shared-config';
import { DEFAULT_INVOICE_POSITION_TYPE, DEFAULT_INVOICE_POSITION_USAGE } from '@okr/shared-constants';
import {
  AccountModel, AccountingConfigModel, FeePositionRule, FeeScheduleEntry, VatCodeModel
} from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategorySelect } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { confirm, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';

import { AccountingI18n, getFeeScheduleYearCategory } from '@okr/finance-accounting-util';

import { FeePositionEditModal } from './fee-position-edit.modal';

/**
 * The year-versioned fee schedule of one accounting tenant, as a section of the accounting
 * settings page. It edits `formData().feeSchedule` in place and emits the changed config — the
 * page owns the change-confirmation banner over the whole config, so this section deliberately
 * has none of its own.
 *
 * Years are never rewritten: «Jahr kopieren» clones the selected year's positions into the next
 * free year, which is how a club rolls its prices forward while last year's invoices stay
 * reproducible.
 */
@Component({
  selector: 'okr-fee-schedule',
  standalone: true,
  imports: [
    SvgIconPipe, CategorySelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonButtons, IonButton, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .fee-schedule-header { display: flex; justify-content: space-between; align-items: center; }
    ion-item { --min-height: 52px; }
    .position-meta { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <div class="fee-schedule-header">
          <ion-card-title>{{ i18n().feeSchedule_title() }}</ion-card-title>
          @if (!isReadOnly()) {
            <ion-buttons>
              <ion-button (click)="showActions()">
                <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          }
        </div>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <okr-cat-select [category]="yearCategory()" [selectedItemName]="selectedYear()"
          (selectedItemNameChange)="selectedYear.set($event)"
          [fieldStyle]="true" [label]="i18n().feeSchedule_year_label()"
          [showIcons]="false" [readOnly]="false" />

        <ion-list lines="inset">
          @for (position of positions(); track $index) {
            <ion-item [button]="true" [detail]="!isReadOnly()" (click)="editPosition($index)">
              <ion-label>
                <p>{{ position.label || position.key }}</p>
                <p class="position-meta">{{ position.source }}</p>
              </ion-label>
              <ion-label slot="end" class="ion-text-end">{{ position.amount ?? 0 }}</ion-label>
              @if (!isReadOnly()) {
                <ion-buttons slot="end">
                  <ion-button (click)="showActions($index); $event.stopPropagation()">
                    <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
                  </ion-button>
                </ion-buttons>
              }
            </ion-item>
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `
})
export class FeeSchedule {
  private readonly env = inject(ENV);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);

  // inputs
  public formData = model.required<AccountingConfigModel>();
  public readonly i18n = input.required<AccountingI18n>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly readOnly = input(true);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  private readonly imgixBaseUrl = this.env.services.imgixBaseUrl;
  private readonly tenantId = this.env.tenantId;

  protected readonly schedule = computed(() => this.formData()?.feeSchedule ?? []);
  /** the years on record plus the current one — a club with no schedule yet still has somewhere to start */
  protected readonly years = computed(() => {
    const years = this.schedule().map(entry => entry.year);
    const currentYear = new Date().getFullYear();
    return years.includes(currentYear) ? years : [...years, currentYear];
  });
  protected readonly yearCategory = computed(() => getFeeScheduleYearCategory(this.tenantId, this.years()));

  // The selected year follows the data until the user picks one; `linkedSignal` re-seeds it when
  // a copied year appears, and `selectedYear.set` wins from then on.
  protected readonly selectedYear = linkedSignal<string[], string>({
    source: () => this.years().map(year => `${year}`),
    computation: (years, previous) =>
      previous && years.includes(previous.value) ? previous.value : `${Math.max(...this.years())}`,
  });

  protected readonly positions = computed(() =>
    this.schedule().find(entry => `${entry.year}` === this.selectedYear())?.positions ?? []);

  /******************************* actions *************************************** */

  /** @param index the position the sheet was opened on; undefined when opened from the header */
  protected async showActions(index?: number): Promise<void> {
    if (this.isReadOnly()) return;
    const i18n = this.i18n();
    const options: ActionSheetOptions = createActionSheetOptions(i18n.feeSchedule_title());
    options.buttons.push(createActionSheetButton(
      'feePosition.add', i18n.feeSchedule_action_addPosition(), this.imgixBaseUrl, 'add-circle'));
    if (index !== undefined) {
      options.buttons.push(createActionSheetButton(
        'feePosition.delete', i18n.feeSchedule_action_deletePosition(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton(
      'feeSchedule.copyYear', i18n.feeSchedule_action_copyYear(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'feePosition.add': await this.addPosition(); break;
      case 'feePosition.delete': if (index !== undefined) await this.deletePosition(index); break;
      case 'feeSchedule.copyYear': this.copyYear(); break;
    }
  }

  protected async editPosition(index: number): Promise<void> {
    const position = this.positions()[index];
    if (!position) return;
    const edited = await this.openModal(position);
    if (!edited) return;
    this.writePositions(this.positions().map((item, i) => i === index ? edited : item));
  }

  private async addPosition(): Promise<void> {
    const edited = await this.openModal(this.newPosition());
    if (!edited) return;
    this.writePositions([...this.positions(), edited]);
  }

  private async deletePosition(index: number): Promise<void> {
    const i18n = this.i18n();
    const confirmed = await confirm(
      this.alertController, i18n.feeSchedule_deletePosition_confirm(), i18n.save(), i18n.cancel(), true);
    if (!confirmed) return;
    this.writePositions(this.positions().filter((_, i) => i !== index));
  }

  /**
   * Clone the selected year's positions into the next year that has no entry yet. Never
   * overwrites an existing year — a schedule already in use must stay reproducible.
   */
  private copyYear(): void {
    const sourceYear = parseInt(this.selectedYear(), 10);
    if (isNaN(sourceYear)) return;
    const taken = new Set(this.schedule().map(entry => entry.year));
    let targetYear = sourceYear + 1;
    while (taken.has(targetYear)) targetYear++;
    const entry: FeeScheduleEntry = { year: targetYear, positions: safeStructuredClone(this.positions()) ?? [] };
    this.formData.update(config => ({ ...config, feeSchedule: [...this.schedule(), entry] }));
    this.selectedYear.set(`${targetYear}`);
  }

  /******************************* helpers *************************************** */

  private async openModal(position: FeePositionRule): Promise<FeePositionRule | undefined> {
    const modal = await this.modalController.create({
      component: FeePositionEditModal,
      componentProps: {
        position,
        i18n: this.i18n(),
        tenantId: this.tenantId,
        accounts: this.accounts(),
        vatCodes: this.vatCodes(),
        readOnly: this.isReadOnly(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    return role === 'confirm' && data ? data as FeePositionRule : undefined;
  }

  /** Writes a new position list back into the selected year, creating that year's entry if needed. */
  private writePositions(positions: FeePositionRule[]): void {
    const year = parseInt(this.selectedYear(), 10);
    if (isNaN(year)) return;
    const schedule = this.schedule();
    const feeSchedule = schedule.some(entry => entry.year === year)
      ? schedule.map(entry => entry.year === year ? { ...entry, positions } : entry)
      : [...schedule, { year, positions }];
    this.formData.update(config => ({ ...config, feeSchedule }));
  }

  private newPosition(): FeePositionRule {
    return {
      key: '',
      usage: DEFAULT_INVOICE_POSITION_USAGE,
      type: DEFAULT_INVOICE_POSITION_TYPE,
      label: '',
      source: 'manual',
      amount: 0,
    };
  }
}
