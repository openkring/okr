import { Component, computed, effect, input, linkedSignal, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonList, IonRow } from '@ionic/angular/standalone';

import { DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { BexioInvoiceFormModel, BexioInvoicePosition, BexioTemplates, DefaultInvoicePositions, bexioInvoiceValidations, defaultInvoicePositionToBexio, InvoiceI18n } from '@bk2/finance-invoice-util';

@Component({
  selector: 'bk-bexio-invoice-new-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    TextInput, DateInput, NumberInput, NotesInput, StringSelect,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonList, IonItem, IonButton, IonIcon,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if(showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="8">
                  <bk-text-input [i18n]="titleI18n()" [value]="title()"
                    (valueChange)="onFieldChange('title', $event)"
                    [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="4">
                  <bk-text-input [i18n]="bexioIdI18n()" [value]="bexioId()"
                    (valueChange)="onFieldChange('bexioId', $event)"
                    [maxLength]="30" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()"
                    (storeDateChange)="onFieldChange('validFrom', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-date-input [i18n]="validToI18n()" [storeDate]="validTo()"
                    (storeDateChange)="onFieldChange('validTo', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-string-select [i18n]="templateI18n()"
                    [stringList]="templateNames"
                    [selectedString]="selectedTemplateName()"
                    (selectedStringChange)="onTemplateChange($event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-notes-input [i18n]="headerI18n()" [value]="header()"
                    (valueChange)="onFieldChange('header', $event)"
                    [title]="i18n().header_title()" [showTitle]="true"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-notes-input [i18n]="footerI18n()" [value]="footer()"
                    (valueChange)="onFieldChange('footer', $event)"
                    [title]="i18n().footer_title()" [showTitle]="true"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>

      <!-- Positions -->
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-list>
            @for (pos of positions(); track $index) {
              <ion-item>
                <ion-grid>
                  <ion-row>
                    <ion-col size="5">
                      <bk-text-input [i18n]="positionTextI18n()" [value]="pos.text"
                        (valueChange)="onPositionFieldChange($index, 'text', $event)"
                        [maxLength]="200" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="2">
                      <bk-number-input [i18n]="unitPriceI18n()" [value]="toNumber(pos.unit_price)"
                        (valueChange)="onPositionPriceChange($index, $event)"
                        [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="2">
                      <bk-number-input [i18n]="posAmountI18n()" [value]="toNumber(pos.amount)"
                        (valueChange)="onPositionAmountChange($index, $event)"
                        [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="2">
                      <bk-number-input [i18n]="accountIdI18n()" [value]="pos.account_id"
                        (valueChange)="onPositionFieldChange($index, 'account_id', $event + '')"
                        [readOnly]="isReadOnly()" />
                    </ion-col>
                    @if (!isReadOnly()) {
                      <ion-col size="1">
                        <ion-button fill="clear" color="danger" (click)="removePosition($index)">
                          <ion-icon slot="icon-only" src="{{'trash' | svgIcon}}" />
                        </ion-button>
                      </ion-col>
                    }
                  </ion-row>
                </ion-grid>
              </ion-item>
            }
          </ion-list>
          @if (!isReadOnly()) {
            <ion-grid>
              <ion-row class="ion-align-items-center">
                <ion-col size="9">
                  <bk-string-select [i18n]="defaultPositionI18n()"
                    [stringList]="defaultPositionNames"
                    [selectedString]="selectedDefaultName()"
                    (selectedStringChange)="selectedDefaultName.set($event)"
                    [readOnly]="false" />
                </ion-col>
                <ion-col size="1">
                  <ion-button fill="clear" (click)="addDefaultPosition()">
                    <ion-icon slot="icon-only" src="{{'add' | svgIcon}}" />
                  </ion-button>
                </ion-col>
              </ion-row>
            </ion-grid>
          }
        </ion-card-content>
      </ion-card>
    }
  `
})
export class BexioInvoiceNewForm {
  public readonly formData = input.required<BexioInvoiceFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);
  public readonly i18n = input.required<InvoiceI18n>();

  protected titleI18n = computed(() => ({
    name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper()
  } as TextInputI18n));

  protected bexioIdI18n = computed(() => ({
    name: 'bexioId', label: this.i18n().bexioId_label(), placeholder: this.i18n().bexioId_placeholder(), helper: this.i18n().bexioId_helper()
  } as TextInputI18n));

  protected positionTextI18n = computed(() => ({
    name: 'text', label: this.i18n().posText_label(), placeholder: this.i18n().posText_placeholder(), helper: this.i18n().posText_helper()
  } as TextInputI18n));

  protected unitPriceI18n = computed(() => ({
    name: 'unitPrice', label: this.i18n().unitPrice_label(), placeholder: this.i18n().unitPrice_placeholder(), helper: this.i18n().unitPrice_helper()
  } as NumberInputI18n));

  protected posAmountI18n = computed(() => ({
    name: 'amount', label: this.i18n().posAmount_label(), placeholder: this.i18n().posAmount_placeholder(), helper: this.i18n().posAmount_helper()
  } as NumberInputI18n));

  protected accountIdI18n = computed(() => ({
    name: 'accountId', label: this.i18n().accountId_label(), placeholder: this.i18n().accountId_placeholder(), helper: this.i18n().accountId_helper()
  } as NumberInputI18n));

  protected headerI18n = computed(() => ({
    name: 'header', label: this.i18n().header_label(), placeholder: this.i18n().header_placeholder()
  } as NotesInputI18n));

  protected footerI18n = computed(() => ({
    name: 'footer', label: this.i18n().footer_label(), placeholder: this.i18n().footer_placeholder()
  } as NotesInputI18n));

  protected validFromI18n = computed(() => ({ name: 'validFrom', label: this.i18n().validFrom_label(), placeholder: this.i18n().validFrom_placeholder(), helper: this.i18n().validFrom_helper() } as DateInputI18n));
  protected validToI18n = computed(() => ({ name: 'validTo', label: this.i18n().validTo_label(), placeholder: this.i18n().validTo_placeholder(), helper: this.i18n().validTo_helper() } as DateInputI18n));
  protected templateI18n        = computed(() => ({ name: 'template',        label: this.i18n().template_label()        } as StringSelectI18n));
  protected defaultPositionI18n = computed(() => ({ name: 'defaultPosition', label: this.i18n().defaultPosition_label() } as StringSelectI18n));

  public readonly formDataChange = output<BexioInvoiceFormModel>();
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  private readonly validationResult = computed(() => bexioInvoiceValidations(this.formData()));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly bexioId = computed(() => this.formData()?.bexioId ?? '');
  protected readonly header = computed(() => this.formData()?.header ?? '');
  protected readonly footer = computed(() => this.formData()?.footer ?? '');
  protected readonly validFrom = computed(() => this.formData()?.validFrom ?? '');
  protected readonly validTo = computed(() => this.formData()?.validTo ?? '');
  protected readonly positions = linkedSignal<BexioInvoicePosition[]>(() => this.formData()?.positions ?? []);

  protected readonly templateNames = BexioTemplates.map(t => t.name);
  protected readonly selectedTemplateName = computed(() => {
    const slug = this.formData()?.template_slug ?? '';
    return BexioTemplates.find(t => t.slug === slug)?.name ?? BexioTemplates[0].name;
  });

  protected readonly defaultPositionNames = DefaultInvoicePositions.map(p => p.name);
  protected readonly selectedDefaultName = signal(DefaultInvoicePositions[0].name);

  protected addDefaultPosition(): void {
    const def = DefaultInvoicePositions.find(p => p.name === this.selectedDefaultName());
    if (!def) return;
    const updated = [...this.positions(), defaultInvoicePositionToBexio(def)];
    this.positions.set(updated);
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), positions: updated });
  }

  protected toNumber(value: string): number {
    return parseFloat(value) || 0;
  }

  protected onTemplateChange(name: string): void {
    const slug = BexioTemplates.find(t => t.name === name)?.slug ?? BexioTemplates[0].slug;
    this.onFieldChange('template_slug', slug);
  }

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), [fieldName]: fieldValue });
  }

  protected onPositionFieldChange(index: number, field: keyof BexioInvoicePosition, value: string): void {
    const updated = this.positions().map((p, i) =>
      i === index ? { ...p, [field]: field === 'account_id' ? parseInt(value, 10) : value } : p
    );
    this.positions.set(updated);
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), positions: updated });
  }

  protected onPositionPriceChange(index: number, value: number | null): void {
    const updated = this.positions().map((p, i) =>
      i === index ? { ...p, unit_price: (value ?? 0).toFixed(2) } : p
    );
    this.positions.set(updated);
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), positions: updated });
  }

  protected onPositionAmountChange(index: number, value: number | null): void {
    const updated = this.positions().map((p, i) =>
      i === index ? { ...p, amount: String(value ?? 1) } : p
    );
    this.positions.set(updated);
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), positions: updated });
  }

  protected addPosition(): void {
    const updated = [...this.positions(), { text: '', unit_price: '0.00', account_id: 0, amount: '1' }];
    this.positions.set(updated);
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), positions: updated });
  }

  protected removePosition(index: number): void {
    const updated = this.positions().filter((_, i) => i !== index);
    this.positions.set(updated);
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), positions: updated });
  }
}
