import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonList, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DateInputComponent, NotesInputComponent, NumberInputComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { BexioInvoiceFormModel, BexioInvoicePosition, BexioTemplates, DefaultInvoicePositions, bexioInvoiceValidations, defaultInvoicePositionToBexio } from '@bk2/finance-invoice-util';

@Component({
  selector: 'bk-bexio-invoice-new-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    vestForms, FormsModule,
    TextInputComponent, DateInputComponent, NumberInputComponent, NotesInputComponent, StringSelectComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonList, IonItem, IonButton, IonIcon,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if(showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
        (formValueChange)="onFormChange($event)">

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="8">
                  <bk-text-input name="title" [value]="title()"
                    (valueChange)="onFieldChange('title', $event)"
                    label="@finance.invoice.field.title.label"
                    [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="4">
                  <bk-text-input name="bexioId" [value]="bexioId()"
                    (valueChange)="onFieldChange('bexioId', $event)"
                    label="@finance.invoice.field.bexioId.label"
                    [maxLength]="30" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-date-input name="validFrom" [storeDate]="validFrom()"
                    (storeDateChange)="onFieldChange('validFrom', $event)"
                    label="@finance.invoice.field.validFrom.label"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-date-input name="validTo" [storeDate]="validTo()"
                    (storeDateChange)="onFieldChange('validTo', $event)"
                    label="@finance.invoice.field.validTo.label"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-string-select name="template"
                    [stringList]="templateNames"
                    [selectedString]="selectedTemplateName()"
                    (selectedStringChange)="onTemplateChange($event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-notes name="header" [value]="header()"
                    (valueChange)="onFieldChange('header', $event)"
                    title="@finance.invoice.field.header.label" [showTitle]="true"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-notes name="footer" [value]="footer()"
                    (valueChange)="onFieldChange('footer', $event)"
                    title="@finance.invoice.field.footer.label" [showTitle]="true"
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
                      <bk-text-input name="text" [value]="pos.text"
                        (valueChange)="onPositionFieldChange($index, 'text', $event)"
                        label="@finance.invoice.field.position.text.label"
                        [maxLength]="200" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="2">
                      <bk-number-input name="unitPrice" [value]="toNumber(pos.unit_price)"
                        (valueChange)="onPositionPriceChange($index, $event)"
                        label="@finance.invoice.field.position.unitPrice.label"
                        [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="2">
                      <bk-number-input name="amount" [value]="toNumber(pos.amount)"
                        (valueChange)="onPositionAmountChange($index, $event)"
                        label="@finance.invoice.field.position.amount.label"
                        [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="2">
                      <bk-number-input name="accountId" [value]="pos.account_id"
                        (valueChange)="onPositionFieldChange($index, 'account_id', $event + '')"
                        label="@finance.invoice.field.position.accountId.label"
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
                  <bk-string-select name="defaultPosition"
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

  public readonly formDataChange = output<BexioInvoiceFormModel>();
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly suite = bexioInvoiceValidations;

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

  protected onFormChange(data: BexioInvoiceFormModel): void {
    // Merge with current formData so vest's partial emission never overwrites fields it doesn't track
    this.formDataChange.emit({ ...this.formData(), ...data, positions: this.positions() });
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
