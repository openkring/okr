import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader, IonInput,
  IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar } from '@ionic/angular/standalone';

import { AccountModel, OcrRuleModel, VatCodeModel } from '@okr/shared-models';
import { normalizeParty, OCR_RULE_I18N_KEYS, OcrRuleI18n } from '@okr/finance-ocr-rule-util';
import { I18nService } from '@okr/shared-i18n';

@Component({
  selector: 'okr-ocr-rule-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonItem, IonLabel, IonInput, IonNote, IonSelect, IonSelectOption, IonToggle,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? i18n.edit_title_ro() : (rule().okey ? i18n.edit_title() : i18n.edit_title_new()) }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">{{ i18n.cancel() }}</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()">{{ i18n.save() }}</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_usage() }}</ion-label>
        <ion-select [(ngModel)]="edit.ocrUsage" [disabled]="readOnly()">
          <ion-select-option value="expense">{{ i18n.f_usage_expense() }}</ion-select-option>
          <ion-select-option value="invoice">{{ i18n.f_usage_invoice() }}</ion-select-option>
          <ion-select-option value="paper">{{ i18n.f_usage_paper() }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_party() }}</ion-label>
        <ion-input [(ngModel)]="edit.party" [readonly]="readOnly()" />
        <ion-note slot="helper">{{ i18n.f_stored_as() }} {{ preview(edit.party) || '—' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_aliases() }}</ion-label>
        <ion-input [(ngModel)]="aliasText" [readonly]="readOnly()" />
        <ion-note slot="helper">{{ i18n.f_stored_as() }} {{ aliasPreview() || '—' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_account() }}</ion-label>
        <ion-select [(ngModel)]="edit.accountKey" [disabled]="readOnly()">
          @for (a of accounts(); track a.okey) {
            <ion-select-option [value]="a.okey">{{ a.id }} — {{ a.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_vat() }}</ion-label>
        <ion-select [(ngModel)]="edit.vatCode" [disabled]="readOnly()">
          <ion-select-option [value]="''">—</ion-select-option>
          @for (v of vatCodes(); track v.okey) {
            <ion-select-option [value]="v.code">{{ v.code }} — {{ v.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_cost_center() }}</ion-label>
        <ion-input [(ngModel)]="edit.costCenterId" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ i18n.f_rank() }}</ion-label>
        <ion-input type="number" [(ngModel)]="edit.rank" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label>{{ i18n.f_active() }}</ion-label>
        <ion-toggle slot="end" [(ngModel)]="edit.active" [disabled]="readOnly()" />
      </ion-item>
    </ion-content>
  `,
})
export class OcrRuleEditModal implements OnInit {
  public readonly rule = input.required<OcrRuleModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);

  private readonly modalController = inject(ModalController);
  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(OCR_RULE_I18N_KEYS) as OcrRuleI18n;
  protected edit!: OcrRuleModel;
  protected aliasText = '';

  ngOnInit(): void {
    this.edit = { ...this.rule() };
    this.aliasText = (this.edit.aliases ?? []).join(', ');
  }

  protected preview(value: string): string {
    return normalizeParty(value ?? '');
  }

  protected aliasPreview(): string {
    return this.aliasText.split(',').map(a => normalizeParty(a)).filter(a => a.length > 0).join(', ');
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    this.edit.aliases = this.aliasText.split(',').map(a => a.trim()).filter(a => a.length > 0);
    this.edit.rank = Number(this.edit.rank) || 0; // ngModel on type=number yields a string; keep it numeric
    await this.modalController.dismiss(this.edit, 'confirm');
  }
}
