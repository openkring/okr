import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader, IonInput,
  IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar } from '@ionic/angular/standalone';

import { AccountModel, OcrRuleModel, VatCodeModel } from '@okr/shared-models';
import { normalizeParty } from '@okr/finance-ocr-rule-util';

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
        <ion-title>{{ readOnly() ? 'OCR-Regel' : (rule().okey ? 'OCR-Regel bearbeiten' : 'Neue OCR-Regel') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Abbrechen</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()">Speichern</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Verwendung</ion-label>
        <ion-select [(ngModel)]="edit.ocrUsage" [disabled]="readOnly()">
          <ion-select-option value="expense">Spesen (expense)</ion-select-option>
          <ion-select-option value="invoice">Rechnung (invoice)</ion-select-option>
          <ion-select-option value="paper">Beleg (paper)</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Partei (Lieferant)</ion-label>
        <ion-input [(ngModel)]="edit.party" [readonly]="readOnly()" />
        <ion-note slot="helper">wird gespeichert als: {{ preview(edit.party) || '—' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Aliase (kommagetrennt)</ion-label>
        <ion-input [(ngModel)]="aliasText" [readonly]="readOnly()" />
        <ion-note slot="helper">wird gespeichert als: {{ aliasPreview() || '—' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Sollkonto</ion-label>
        <ion-select [(ngModel)]="edit.accountKey" [disabled]="readOnly()">
          @for (a of accounts(); track a.okey) {
            <ion-select-option [value]="a.okey">{{ a.id }} — {{ a.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">MWST-Code (optional)</ion-label>
        <ion-select [(ngModel)]="edit.vatCode" [disabled]="readOnly()">
          <ion-select-option [value]="''">—</ion-select-option>
          @for (v of vatCodes(); track v.okey) {
            <ion-select-option [value]="v.code">{{ v.code }} — {{ v.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Kostenstelle (optional)</ion-label>
        <ion-input [(ngModel)]="edit.costCenterId" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Rang</ion-label>
        <ion-input type="number" [(ngModel)]="edit.rank" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label>Aktiv</ion-label>
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
